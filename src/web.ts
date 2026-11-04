// The hosted scanner's request handler, shared by the Vercel function and the local dev server.
import type { Browser } from "playwright";
import { analyze } from "./analyze.js";
import { crawl } from "./crawl.js";
import { BlockedUrlError, checkScanTarget, guardContext } from "./guard.js";
import { renderCsv, renderHtml, renderPia, summarize, toJson } from "./report.js";
import { loadVendors } from "./vendors.js";

export const WEB_LIMITS = {
  maxPages: 5,
  /** Scans allowed per visitor IP per window, per server instance. The Vercel Firewall rule is the real limit. */
  scansPerWindow: 5,
  windowMs: 10 * 60_000,
  /** Leaves room under the function's 120 s limit to analyze and respond. */
  crawlBudgetMs: 80_000,
};

const db = loadVendors();
const recent = new Map<string, number[]>();
let busy = 0;

export interface HandlerOptions {
  launch?: () => Promise<Browser>;
  /** Pages scanned at most per instance at once; a browser uses most of a function's memory. */
  maxConcurrent?: number;
}

export async function handleScan(request: Request, opts: HandlerOptions = {}): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  let body: { url?: unknown; org?: unknown; maxPages?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Send JSON with a url field." }, 400);
  }
  if (typeof body.url !== "string" || body.url.length > 2048) return json({ error: "Enter a website address." }, 400);
  const org = typeof body.org === "string" && body.org.trim() ? body.org.trim().slice(0, 120) : null;
  const maxPages = Math.min(Math.max(Number(body.maxPages) || 3, 1), WEB_LIMITS.maxPages);

  const ip = clientIp(request);
  if (!allow(ip)) {
    return json({ error: "You've run several scans in a short time. Please wait a few minutes and try again." }, 429);
  }
  if (busy >= (opts.maxConcurrent ?? 1)) {
    return json({ error: "The scanner is busy with another scan. Please try again in a minute." }, 503);
  }

  busy++;
  try {
    const target = await checkScanTarget(body.url);
    const result = await crawl({
      startUrl: target.toString(),
      maxPages,
      waitMs: 2500,
      timeoutMs: 20_000,
      deadline: Date.now() + WEB_LIMITS.crawlBudgetMs,
      launch: opts.launch,
      setupContext: guardContext,
    });
    if (result.pages.every((p) => p.error)) {
      return json({ error: `The site couldn't be loaded: ${result.pages[0]?.error ?? "no pages were reachable"}` }, 502);
    }
    const analysis = analyze(result, db, org);
    return json({
      summary: summarize(analysis),
      report: toJson(analysis),
      files: { html: renderHtml(analysis), csv: renderCsv(analysis), pia: renderPia(analysis) },
    });
  } catch (err) {
    if (err instanceof BlockedUrlError) return json({ error: err.message }, 400);
    // Log the failure without the address that was scanned.
    console.error("scan failed:", (err as Error).message.split("\n")[0]);
    return json({ error: "The scan failed. The site may be blocking automated browsers, or took too long to load." }, 500);
  } finally {
    busy--;
  }
}

function allow(ip: string): boolean {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WEB_LIMITS.windowMs);
  if (hits.length >= WEB_LIMITS.scansPerWindow) {
    recent.set(ip, hits);
    return false;
  }
  hits.push(now);
  recent.set(ip, hits);
  return true;
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
