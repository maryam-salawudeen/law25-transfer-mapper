// Offline end-to-end test: a local site, with every third-party host faked by route interception.
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyze } from "../src/analyze.js";
import { crawl } from "../src/crawl.js";
import { writeReports } from "../src/report.js";
import { loadVendors } from "../src/vendors.js";

const PAGES: Record<string, string> = {
  "/": `<!doctype html><title>Accueil</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
    <script src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script>
    <script>
      document.cookie = "_ga=GA1.1.42.42; path=/";
      fetch("https://region1.google-analytics.com/g/collect?v=2&tid=G-TEST&cid=42.42", { method: "POST", body: "en=page_view" });
    </script>
    <a href="/contact">Contact</a> <a href="/private/secret">Private</a> <a href="https://elsewhere.example/">Out</a>`,
  "/contact": `<!doctype html><title>Contact</title>
    <form action="https://forms.hsforms.com/submissions/v3" method="post">
      <input name="courriel" type="email"><input name="prenom"><button>Envoyer</button>
    </form>
    <img src="https://px.unknown-tracker.example/p.gif?uid=7&e=jane%40example.com">`,
  "/private/secret": `<!doctype html><title>Secret</title>`,
  "/robots.txt": "User-agent: *\nDisallow: /private\n",
};

let server: Server;
let base: string;
let outDir: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const body = PAGES[req.url ?? "/"];
    if (body === undefined) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": req.url === "/robots.txt" ? "text/plain" : "text/html" }).end(body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  outDir = mkdtempSync(join(tmpdir(), "law25-test-"));
});

afterAll(() => {
  server?.close();
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

describe("crawl to report", () => {
  it("records third-party flows before consent and writes all four reports", async () => {
    const result = await crawl({
      startUrl: base + "/",
      maxPages: 5,
      waitMs: 500,
      setupContext: async (context) => {
        await context.route(
          (url) => url.hostname !== "127.0.0.1",
          (route) => route.fulfill({ status: 200, contentType: "text/plain", body: "" }),
        );
      },
    });

    expect(result.pages.map((p) => new URL(p.url).pathname)).toEqual(["/", "/contact"]);
    expect(result.skippedByRobots.map((u) => new URL(u).pathname)).toEqual(["/private/secret"]);
    // Query values are never stored.
    expect(result.requests.every((r) => !r.url.includes("?"))).toBe(true);

    const a = analyze(result, loadVendors());
    const labels = a.flows.map((f) => f.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Google Analytics", "Google Tag Manager", "Google Fonts", "HubSpot", "unknown-tracker.example"]),
    );
    expect(labels).not.toContain("elsewhere.example");

    const ga = a.flows.find((f) => f.label === "Google Analytics")!;
    expect(ga.firstPartyCookies).toContain("_ga");
    expect(ga.idParams).toContain("cid");
    expect(ga.postCount).toBeGreaterThan(0);

    const unknown = a.flows.find((f) => f.label === "unknown-tracker.example")!;
    expect(unknown.emailInUrl).toBe(true);
    expect(unknown.severity).toBe("high");

    const hubspot = a.flows.find((f) => f.label === "HubSpot")!;
    expect(hubspot.signals.find((s) => s.id === "form-to-third-party")?.severity).toBe("high");

    const paths = writeReports(a, outDir);
    const html = readFileSync(paths.html, "utf8");
    expect(html).toContain("Law 25 transfer map");
    expect(html).not.toContain("jane%40example.com");
    expect(JSON.parse(readFileSync(paths.json, "utf8")).flows.length).toBe(a.flows.length);
    expect(readFileSync(paths.csv, "utf8").trim().split("\n").length).toBe(a.flows.length + 1);
    expect(readFileSync(paths.pia, "utf8")).toContain("Factor 3: Protection measures");
  }, 60_000);
});
