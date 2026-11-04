import { describe, expect, it } from "vitest";
import { analyze, outsideQuebec } from "../src/analyze.js";
import { parseRobots } from "../src/crawl.js";
import { containsEmail, contactParams, idParams, personalInputs, queryKeys } from "../src/detect.js";
import { renderCsv, renderPia } from "../src/report.js";
import { hostMatches, isFirstParty, registrableDomain, stripQuery } from "../src/site.js";
import type { CrawlResult, RequestRecord } from "../src/types.js";
import { describeHq, loadVendors } from "../src/vendors.js";

const db = loadVendors();

describe("site", () => {
  it("finds the registrable domain", () => {
    expect(registrableDomain("www.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("https://shop.example.ca/path")).toBe("example.ca");
    expect(registrableDomain("127.0.0.1")).toBe("127.0.0.1");
  });

  it("separates first and third parties", () => {
    expect(isFirstParty("cdn.example.ca", ["example.ca"])).toBe(true);
    expect(isFirstParty("example.ca.evil.com", ["example.ca"])).toBe(false);
  });

  it("matches hosts by suffix on a label boundary", () => {
    expect(hostMatches("region1.google-analytics.com", "google-analytics.com")).toBe(true);
    expect(hostMatches("notgoogle-analytics.com", "google-analytics.com")).toBe(false);
  });

  it("drops query strings", () => {
    expect(stripQuery("https://a.com/p?email=x@y.com#h")).toBe("https://a.com/p");
  });
});

describe("vendors", () => {
  it("has unique ids and no domain listed twice", () => {
    const ids = db.vendors.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    const domains = db.vendors.flatMap((v) => v.domains);
    expect(new Set(domains).size).toBe(domains.length);
  });

  it("matches subdomains and prefers the most specific pattern", () => {
    expect(db.match("region1.google-analytics.com")?.id).toBe("google-analytics");
    expect(db.match("www.google.com", "/recaptcha/api.js")?.id).toBe("google-recaptcha");
    expect(db.match("www.google.com", "/search")?.id).toBe("google-other");
    expect(db.match("fonts.gstatic.com")?.id).toBe("google-fonts");
    expect(db.match("cdn.shopify.com")?.id).toBe("shopify");
    expect(db.match("unknown-tracker.example")).toBeNull();
  });

  it("attributes first-party cookies to the script that set them", () => {
    expect(db.matchCookie("_ga_ABC123")?.id).toBe("google-analytics");
    expect(db.matchCookie("_fbp")?.id).toBe("meta-pixel");
    expect(db.matchCookie("session")).toBeNull();
  });

  it("treats other provinces as outside Québec", () => {
    expect(outsideQuebec(db.vendors.find((v) => v.id === "shopify")!)).toBe("yes");
    expect(outsideQuebec(db.vendors.find((v) => v.id === "coveo")!)).toBe("confirm");
    expect(outsideQuebec(db.vendors.find((v) => v.id === "google-analytics")!)).toBe("yes");
    expect(outsideQuebec(null)).toBe("unknown");
    expect(describeHq({ country: "CA", region: "ON" })).toBe("Ontario, Canada");
    expect(describeHq({ country: "US" })).toBe("United States");
  });
});

describe("detectors", () => {
  it("finds plain and percent-encoded email addresses", () => {
    expect(containsEmail("https://t.example/c?e=jane.doe@example.com")).toBe(true);
    expect(containsEmail("https://t.example/c?e=jane.doe%40example.com")).toBe(true);
    expect(containsEmail("https://t.example/c?e=%E0%A4%A")).toBe(false);
    expect(containsEmail("https://t.example/c?v=2")).toBe(false);
  });

  it("recognises identifier and contact parameters", () => {
    const keys = queryKeys("https://x.test/?gclid=1&cid=2&v=2&ud[em]=h&tid=G-1");
    expect(idParams(keys)).toEqual(["gclid", "cid"]);
    expect(contactParams(keys)).toEqual(["ud[em]"]);
  });

  it("spots personal form fields in English and French", () => {
    expect(
      personalInputs([
        { name: "courriel", type: "email" },
        { name: "prenom", type: "text" },
        { name: "q", type: "search" },
      ]),
    ).toEqual(["courriel", "prenom"]);
  });
});

describe("robots.txt", () => {
  it("applies the * group with longest-match wins", () => {
    const allowed = parseRobots("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /private\nAllow: /private/ok\n");
    expect(allowed("/")).toBe(true);
    expect(allowed("/private/x")).toBe(false);
    expect(allowed("/private/ok/page")).toBe(true);
  });
});

function req(url: string, extra: Partial<RequestRecord> = {}): RequestRecord {
  const u = new URL(url);
  return {
    url: u.origin + u.pathname,
    host: u.hostname,
    site: registrableDomain(u.hostname),
    method: "GET",
    resourceType: "script",
    pageUrl: "https://example.ca/",
    queryKeys: queryKeys(url),
    hasPostBody: false,
    emailInUrl: false,
    emailInBody: false,
    ...extra,
  };
}

function fixture(): CrawlResult {
  return {
    startUrl: "https://example.ca/",
    firstPartySites: ["example.ca"],
    startedAt: "2026-11-04T00:00:00.000Z",
    finishedAt: "2026-11-04T00:00:10.000Z",
    userAgent: "test",
    pages: [{ url: "https://example.ca/", status: 200, title: "Home" }],
    skippedByRobots: [],
    requests: [
      req("https://example.ca/app.js"),
      req("https://www.googletagmanager.com/gtag/js?id=G-1"),
      req("https://region1.google-analytics.com/g/collect?cid=123&tid=G-1", { resourceType: "fetch" }),
      req("https://fonts.gstatic.com/s/inter.woff2", { resourceType: "font" }),
      req("https://t.mystery-tracker.example/p?uid=9&email=x", { emailInUrl: true }),
      req("https://script.hotjar.com/modules.js"),
    ],
    cookies: [
      { name: "_ga", domain: ".example.ca", site: "example.ca", expires: 1, httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "session", domain: "example.ca", site: "example.ca", expires: null, httpOnly: true, secure: true, sameSite: "Lax" },
    ],
    forms: [
      {
        pageUrl: "https://example.ca/contact",
        action: "https://forms.hsforms.com/submit",
        actionHost: "forms.hsforms.com",
        actionSite: "hsforms.com",
        method: "POST",
        inputs: [
          { name: "email", type: "email" },
          { name: "message", type: "textarea" },
        ],
      },
    ],
  };
}

describe("analyze", () => {
  const a = analyze(fixture(), db, "Exemple inc.");
  const byLabel = (l: string) => a.flows.find((f) => f.label === l)!;

  it("groups requests by vendor and ignores first-party ones", () => {
    expect(a.flows.map((f) => f.label).sort()).toEqual(
      ["Google Analytics", "Google Fonts", "Google Tag Manager", "HubSpot", "Hotjar", "mystery-tracker.example"].sort(),
    );
  });

  it("attributes the _ga cookie and the cid identifier to Google Analytics", () => {
    const ga = byLabel("Google Analytics");
    expect(ga.firstPartyCookies).toEqual(["_ga"]);
    expect(ga.idParams).toEqual(["cid"]);
    expect(ga.signals.map((s) => s.id)).toContain("profiling-before-choice");
    expect(ga.outsideQuebec).toBe("yes");
  });

  it("marks emails, forms and session replay as high priority", () => {
    expect(byLabel("mystery-tracker.example").severity).toBe("high");
    expect(byLabel("mystery-tracker.example").signals.map((s) => s.id)).toContain("unidentified");
    expect(byLabel("HubSpot").signals.map((s) => s.id)).toContain("form-to-third-party");
    expect(byLabel("Hotjar").severity).toBe("high");
    expect(byLabel("Google Fonts").severity).toBe("low");
    expect(a.flows[0]!.severity).toBe("high");
  });

  it("drafts a PIA with all four s. 17 factors for every recipient", () => {
    const pia = renderPia(a);
    expect(pia).toContain("Exemple inc.");
    for (const f of a.flows) expect(pia).toContain(`### ${f.label}`);
    const count = (s: string) => pia.split(s).length - 1;
    expect(count("Factor 1: Sensitivity of the information")).toBe(a.flows.length);
    expect(count("Factor 4: Legal framework where the information goes")).toBe(a.flows.length);
    expect(pia).toContain("(s. 18.3)");
    expect(pia).toContain("not legal advice");
    expect(pia).toContain("[Unidentified: find out who operates");
  });

  it("writes a CSV with one row per recipient and neutralised formulas", () => {
    const csv = renderCsv(a).trim().split("\n");
    expect(csv).toHaveLength(a.flows.length + 1);
    expect(csv[0]).toContain('"outside_quebec"');
  });
});
