import { chromium, type BrowserContext, type Page, type Request } from "playwright";
import { containsEmail, queryKeys } from "./detect.js";
import { hostOf, isFirstParty, registrableDomain, stripQuery } from "./site.js";
import type { CookieRecord, CrawlResult, FormRecord, PageRecord, RequestRecord } from "./types.js";

export const TOOL_UA_TOKEN = "law25-transfer-mapper/0.1";

export interface CrawlOptions {
  startUrl: string;
  maxPages?: number;
  /** Extra registrable domains the organization owns, treated as first party. */
  alsoFirstParty?: string[];
  /** How long to wait on each page after it loads, for delayed tags (ms). */
  waitMs?: number;
  timeoutMs?: number;
  respectRobots?: boolean;
  headless?: boolean;
  /** For tests: lets a caller set up route interception before any page opens. */
  setupContext?: (context: BrowserContext) => Promise<void>;
  onPage?: (url: string, index: number) => void;
}

const SKIP_EXTENSIONS = /\.(?:pdf|zip|gz|rar|7z|dmg|exe|msi|jpe?g|png|gif|webp|svg|ico|mp4|mov|webm|mp3|wav|docx?|xlsx?|pptx?|csv|xml|json|txt)$/i;
const MAX_BODY_SCAN = 20_000;

export async function crawl(opts: CrawlOptions): Promise<CrawlResult> {
  const startUrl = new URL(opts.startUrl).toString();
  const maxPages = opts.maxPages ?? 10;
  const firstPartySites = [registrableDomain(startUrl), ...(opts.alsoFirstParty ?? []).map(registrableDomain)];
  const startedAt = new Date().toISOString();

  const browser = await chromium.launch({ headless: opts.headless ?? true });
  try {
    // Identify the crawler honestly, without the "HeadlessChrome" marker that some sites use to skip their tags.
    const userAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version().split(".")[0]}.0.0.0 Safari/537.36 ${TOOL_UA_TOKEN}`;
    const context = await browser.newContext({
      userAgent,
      locale: "fr-CA",
      timezoneId: "America/Toronto",
      viewport: { width: 1366, height: 900 },
    });
    await opts.setupContext?.(context);

    const requests: RequestRecord[] = [];
    let currentPage = startUrl;
    context.on("request", (req) => requests.push(recordRequest(req, currentPage, firstPartySites)));

    const robots = opts.respectRobots === false ? null : await loadRobots(context, startUrl);
    const queue = [normalize(startUrl)];
    const seen = new Set(queue);
    const visited = new Set<string>();
    const pages: PageRecord[] = [];
    const skippedByRobots: string[] = [];
    const forms: Omit<FormRecord, "actionSite">[] = [];
    const page = await context.newPage();

    while (queue.length > 0 && pages.length < maxPages) {
      const url = queue.shift()!;
      if (robots && !robots(new URL(url).pathname)) {
        skippedByRobots.push(url);
        continue;
      }
      currentPage = url;
      opts.onPage?.(url, pages.length);
      const record: PageRecord = { url, status: null, title: "" };
      pages.push(record);
      try {
        const res = await page.goto(url, { waitUntil: "load", timeout: opts.timeoutMs ?? 30_000 });
        // Follow redirects (www to the bare domain, say) so the same page isn't visited twice.
        const finalUrl = normalize(page.url());
        if (finalUrl !== url && visited.has(finalUrl)) {
          pages.pop();
          continue;
        }
        record.url = currentPage = finalUrl;
        visited.add(finalUrl);
        seen.add(finalUrl);
        record.status = res?.status() ?? null;
        await settle(page, opts.waitMs ?? 4000);
        record.title = await page.title();
        forms.push(...(await collectForms(page, finalUrl)));
        for (const link of await collectLinks(page)) {
          const next = normalize(link);
          if (!seen.has(next) && isCrawlable(next, firstPartySites)) {
            seen.add(next);
            queue.push(next);
          }
        }
      } catch (err) {
        record.error = (err as Error).message.split("\n")[0];
      }
    }

    const cookies = (await context.cookies()).map(
      (c): CookieRecord => ({
        name: c.name,
        domain: c.domain,
        site: registrableDomain(c.domain.replace(/^\./, "")),
        expires: c.expires > 0 ? Math.round(c.expires) : null,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      }),
    );

    return {
      startUrl,
      firstPartySites,
      startedAt,
      finishedAt: new Date().toISOString(),
      userAgent,
      pages,
      skippedByRobots,
      requests,
      cookies,
      forms: forms.map((f) => ({ ...f, actionSite: registrableDomain(f.actionHost) })),
    };
  } finally {
    await browser.close();
  }
}

function recordRequest(req: Request, pageUrl: string, firstPartySites: string[]): RequestRecord {
  const raw = req.url();
  const host = hostOf(raw);
  let body = "";
  try {
    body = req.postDataBuffer()?.subarray(0, MAX_BODY_SCAN).toString("utf8") ?? "";
  } catch {
    body = "";
  }
  return {
    url: stripQuery(raw),
    host,
    site: host ? registrableDomain(host) : "",
    method: req.method(),
    resourceType: req.resourceType(),
    pageUrl,
    queryKeys: queryKeys(raw),
    hasPostBody: body.length > 0,
    // Only third-party requests matter here; an email in a first-party URL stays on the site.
    emailInUrl: !isFirstParty(host, firstPartySites) && containsEmail(raw),
    emailInBody: !isFirstParty(host, firstPartySites) && body.length > 0 && containsEmail(body),
  };
}

/** Waits for delayed tags, and scrolls once so lazy-loaded embeds fire. */
async function settle(page: Page, waitMs: number): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: waitMs }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, document.body?.scrollHeight ?? 0)).catch(() => {});
  await page.waitForTimeout(Math.min(waitMs, 1500));
}

async function collectLinks(page: Page): Promise<string[]> {
  return page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href));
}

async function collectForms(page: Page, pageUrl: string): Promise<Omit<FormRecord, "actionSite">[]> {
  const raw = await page.$$eval("form", (fs) =>
    fs.map((f) => {
      const form = f as HTMLFormElement;
      return {
        action: form.action,
        method: (form.method || "get").toUpperCase(),
        inputs: Array.from(form.elements)
          .filter((e) => "name" in e && "type" in e)
          .map((e) => ({ name: (e as HTMLInputElement).name, type: (e as HTMLInputElement).type }))
          .filter((i) => i.type !== "submit" && i.type !== "button"),
      };
    }),
  );
  return raw.map((f) => ({ ...f, action: stripQuery(f.action), actionHost: hostOf(f.action), pageUrl }));
}

function normalize(url: string): string {
  const u = new URL(url);
  u.hash = "";
  return u.toString();
}

function isCrawlable(url: string, firstPartySites: string[]): boolean {
  const u = new URL(url);
  return (
    (u.protocol === "http:" || u.protocol === "https:") &&
    isFirstParty(u.hostname, firstPartySites) &&
    !SKIP_EXTENSIONS.test(u.pathname) &&
    !/(?:log-?out|sign-?out|deconnexion|déconnexion)/i.test(u.pathname)
  );
}

type RobotsCheck = (path: string) => boolean;

/** A small robots.txt reader: the "User-agent: *" group, Allow/Disallow prefixes, longest match wins. */
export function parseRobots(text: string): RobotsCheck {
  const rules: { allow: boolean; path: string }[] = [];
  let inStar = false;
  let groupStarted = false;
  for (const line of text.split(/\r?\n/)) {
    const [rawKey, ...rest] = line.replace(/#.*/, "").split(":");
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (!key) continue;
    if (key === "user-agent") {
      if (groupStarted) inStar = false;
      groupStarted = false;
      if (value === "*") inStar = true;
    } else if (key === "allow" || key === "disallow") {
      groupStarted = true;
      if (inStar && value) rules.push({ allow: key === "allow", path: value.replace(/\*$/, "") });
    }
  }
  return (path) => {
    let best: { allow: boolean; path: string } | null = null;
    for (const r of rules) {
      if (path.startsWith(r.path) && (!best || r.path.length > best.path.length)) best = r;
    }
    return best ? best.allow : true;
  };
}

async function loadRobots(context: BrowserContext, startUrl: string): Promise<RobotsCheck | null> {
  try {
    const res = await context.request.get(new URL("/robots.txt", startUrl).toString(), { timeout: 10_000 });
    return res.ok() ? parseRobots(await res.text()) : null;
  } catch {
    return null;
  }
}
