import { contactParams, idParams, personalInputs, unique } from "./detect.js";
import { isFirstParty } from "./site.js";
import { describeHq, isProfiling, type VendorDb } from "./vendors.js";
import type { Analysis, CrawlResult, Flow, OutsideQuebec, Severity, Signal, Vendor } from "./types.js";

const RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

export function analyze(crawl: CrawlResult, db: VendorDb, org: string | null = null): Analysis {
  const fp = crawl.firstPartySites;
  const groups = new Map<string, { vendor: Vendor | null; flow: Flow }>();

  const flowFor = (site: string, host: string, path: string): Flow => {
    const vendor = db.match(host, path);
    const key = vendor ? `vendor:${vendor.id}` : `site:${site}`;
    let g = groups.get(key);
    if (!g) {
      g = { vendor, flow: emptyFlow(key, vendor, site) };
      groups.set(key, g);
    }
    g.flow.sites.push(site);
    return g.flow;
  };

  for (const r of crawl.requests) {
    if (!r.host || isFirstParty(r.host, fp) || !/^https?:/.test(r.url)) continue;
    const path = safePath(r.url);
    const f = flowFor(r.site, r.host, path);
    f.requestCount++;
    if (r.hasPostBody) f.postCount++;
    f.hosts.push(r.host);
    f.pages.push(r.pageUrl);
    f.resourceTypes.push(r.resourceType);
    f.queryKeys.push(...r.queryKeys);
    f.emailInUrl ||= r.emailInUrl;
    f.emailInBody ||= r.emailInBody;
  }

  for (const c of crawl.cookies) {
    const domain = c.domain.replace(/^\./, "");
    if (!isFirstParty(domain, fp)) {
      flowFor(c.site, domain, "/").thirdPartyCookies.push(c.name);
    } else {
      // A first-party cookie written by a vendor's script, like _ga, whose value is then sent to that vendor.
      const vendor = db.matchCookie(c.name);
      if (vendor) {
        const existing = groups.get(`vendor:${vendor.id}`);
        if (existing) existing.flow.firstPartyCookies.push(c.name);
      }
    }
  }

  let firstPartyFormsToThirdParty = 0;
  for (const form of crawl.forms) {
    if (!form.actionHost || isFirstParty(form.actionHost, fp)) continue;
    firstPartyFormsToThirdParty++;
    flowFor(form.actionSite, form.actionHost, safePath(form.action)).forms.push(form);
  }

  const flows = [...groups.values()].map(({ flow }) => finish(flow));
  flows.sort((a, b) => RANK[b.severity] - RANK[a.severity] || b.requestCount - a.requestCount);
  return { org, crawl, flows, firstPartyFormsToThirdParty, generatedAt: new Date().toISOString() };
}

function emptyFlow(key: string, vendor: Vendor | null, site: string): Flow {
  const category = vendor?.category ?? "other";
  return {
    key,
    vendor,
    label: vendor ? vendor.name : site,
    category,
    sites: [],
    hosts: [],
    requestCount: 0,
    postCount: 0,
    pages: [],
    resourceTypes: [],
    queryKeys: [],
    idParams: [],
    contactParams: [],
    emailInUrl: false,
    emailInBody: false,
    thirdPartyCookies: [],
    firstPartyCookies: [],
    forms: [],
    profiling: isProfiling(vendor, category),
    destination: describeHq(vendor?.hq ?? null),
    outsideQuebec: outsideQuebec(vendor),
    severity: "low",
    signals: [],
  };
}

export function outsideQuebec(vendor: Vendor | null): OutsideQuebec {
  if (!vendor?.hq) return "unknown";
  if (vendor.hq.country === "CA" && vendor.hq.region === "QC") return "confirm";
  return "yes";
}

function finish(f: Flow): Flow {
  f.sites = unique(f.sites);
  f.hosts = unique(f.hosts).sort();
  f.pages = unique(f.pages);
  f.resourceTypes = unique(f.resourceTypes).sort();
  f.queryKeys = unique(f.queryKeys).sort();
  f.idParams = idParams(f.queryKeys);
  f.contactParams = contactParams(f.queryKeys);
  f.thirdPartyCookies = unique(f.thirdPartyCookies).sort();
  f.firstPartyCookies = unique(f.firstPartyCookies).sort();
  f.signals = signalsFor(f);
  f.severity = f.signals.reduce<Severity>((s, x) => (RANK[x.severity] > RANK[s] ? x.severity : s), "low");
  return f;
}

export function signalsFor(f: Flow): Signal[] {
  const s: Signal[] = [];
  const add = (id: string, severity: Severity, title: string, detail: string, sections: string[]) =>
    s.push({ id, severity, title, detail, sections });

  if (f.emailInUrl || f.emailInBody) {
    add(
      "email-sent",
      "high",
      "An email address was sent to this third party",
      `An email address appeared in ${f.emailInUrl ? "a request address" : "a request body"} sent to ${f.label}. Addresses in URLs also end up in server logs and browser history.`,
      ["s10", "s17"],
    );
  }
  if (f.contactParams.length > 0) {
    add(
      "contact-params",
      "high",
      "Contact details may be sent, possibly hashed",
      `Requests used parameters that usually carry contact details: ${f.contactParams.join(", ")}. A hashed email is still personal information because it can be matched.`,
      ["s17"],
    );
  }
  const personalForms = f.forms.filter((form) => personalInputs(form.inputs).length > 0);
  if (personalForms.length > 0) {
    const fields = unique(personalForms.flatMap((form) => personalInputs(form.inputs)));
    add(
      "form-to-third-party",
      "high",
      "A form sends personal information straight to this third party",
      `${personalForms.length} form(s) submit to ${f.hosts.join(", ") || f.label}, with fields such as ${fields.slice(0, 6).join(", ")}.`,
      ["s8", "s17", "s18_3"],
    );
  } else if (f.forms.length > 0) {
    add("form-to-third-party", "medium", "A form submits to this third party", `${f.forms.length} form(s) submit here.`, ["s17"]);
  }
  if (f.category === "session-replay") {
    add(
      "session-replay",
      "high",
      "Session recording tool",
      "Session replay tools can record clicks, scrolling and what people type into forms. Check that form fields are masked.",
      ["s8_1", "s10", "s17"],
    );
  }
  if (f.profiling && f.requestCount > 0) {
    add(
      "profiling-before-choice",
      "medium",
      "Tracking that can identify or profile loaded before any choice",
      "This tool loaded during a visit where no consent banner was clicked. Section 8.1 requires informing people before using technology that can identify, locate or profile them, and telling them how to activate those functions.",
      ["s8_1"],
    );
  }
  if (f.idParams.length > 0) {
    add("id-params", "medium", "Visitor or click identifiers sent", `Identifier parameters seen: ${f.idParams.join(", ")}.`, ["s17"]);
  }
  if (f.thirdPartyCookies.length > 0 || f.firstPartyCookies.length > 0) {
    const names = [...f.thirdPartyCookies, ...f.firstPartyCookies];
    add(
      "cookies",
      "medium",
      "Cookies set for this third party",
      `Cookies: ${names.slice(0, 10).join(", ")}${names.length > 10 ? ` and ${names.length - 10} more` : ""}. ${f.firstPartyCookies.length > 0 ? "Some are stored on your own domain but belong to this vendor's script." : ""}`.trim(),
      ["s8_1", "s17"],
    );
  }
  if (f.category === "tag-manager") {
    add("tag-manager", "medium", "Tag manager", "A tag manager loads other tools. The tools it loaded during this visit are listed separately, and it can load different ones later.", ["s17"]);
  }
  if (!f.vendor) {
    add(
      "unidentified",
      "medium",
      "Unidentified: find out who operates this",
      "This tool doesn't know who runs this domain or where it is. You can't assess a transfer without knowing who receives it. If it's one of your own domains, run the scan again with --first-party.",
      ["s17"],
    );
  }
  if (f.requestCount > 0) {
    add(
      "ip-address",
      "low",
      "Visitor IP address and browser details sent",
      "Every request to a third party sends the visitor's IP address and browser details, which can be personal information.",
      ["s17"],
    );
  }
  return s;
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "/";
  }
}
