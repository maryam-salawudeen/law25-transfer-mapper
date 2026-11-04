#!/usr/bin/env node
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { analyze } from "./analyze.js";
import { crawl } from "./crawl.js";
import { summarize, writeReports } from "./report.js";
import { loadVendors } from "./vendors.js";

const HELP = `law25-map: map what a website sends outside Québec and draft the Law 25 (s. 17) assessment.

Usage
  law25-map <url> [options]

Options
  --max-pages <n>      Pages to visit on the same site (default 10)
  --out <dir>          Where to write the reports (default reports/<host>-<date>)
  --org <name>         Organization name for the reports
  --first-party <list> Other domains your organization owns, comma separated
  --wait <ms>          Time to wait on each page for delayed tags (default 4000)
  --timeout <ms>       Page load timeout (default 30000)
  --ignore-robots      Don't follow robots.txt. Only for sites you are responsible for.
  --headed             Show the browser window
  -h, --help           Show this help

Outputs: report.html, report.json, inventory.csv and pia-draft.md.
This tool is informational and is not legal advice.`;

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "max-pages": { type: "string" },
      out: { type: "string" },
      org: { type: "string" },
      "first-party": { type: "string" },
      wait: { type: "string" },
      timeout: { type: "string" },
      "ignore-robots": { type: "boolean" },
      headed: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || positionals.length === 0) {
    console.log(HELP);
    return positionals.length === 0 && !values.help ? 1 : 0;
  }

  let startUrl = positionals[0]!;
  if (!/^https?:\/\//i.test(startUrl)) startUrl = `https://${startUrl}`;
  let host: string;
  try {
    host = new URL(startUrl).hostname;
  } catch {
    console.error(`Not a valid URL: ${positionals[0]}`);
    return 1;
  }

  const maxPages = toInt(values["max-pages"], 10, "--max-pages");
  const waitMs = toInt(values.wait, 4000, "--wait");
  const timeoutMs = toInt(values.timeout, 30_000, "--timeout");
  const outDir = values.out ?? join("reports", `${host}-${new Date().toISOString().slice(0, 10)}`);

  console.log(`Scanning ${startUrl} (up to ${maxPages} page(s), no consent given)...`);
  const result = await crawl({
    startUrl,
    maxPages,
    waitMs,
    timeoutMs,
    alsoFirstParty: values["first-party"]?.split(",").map((s) => s.trim()).filter(Boolean),
    respectRobots: !values["ignore-robots"],
    headless: !values.headed,
    onPage: (url, i) => console.log(`  [${i + 1}/${maxPages}] ${url}`),
  });

  const analysis = analyze(result, loadVendors(), values.org ?? null);
  const paths = writeReports(analysis, outDir);
  const s = summarize(analysis);

  console.log("");
  console.log(`${s.thirdParties} third part${s.thirdParties === 1 ? "y" : "ies"} received data from ${s.pagesVisited} page(s).`);
  console.log(`  ${s.outsideQuebec} headquartered outside Québec, ${s.unknownLocation} unknown`);
  console.log(`  ${s.high} high priority, ${s.profilingBeforeChoice} can profile and loaded before any choice, ${s.unidentified} unidentified`);
  console.log("");
  for (const [name, p] of Object.entries(paths)) console.log(`  ${name.padEnd(5)} ${relative(process.cwd(), p)}`);
  console.log("\nInformational only, not legal advice.");
  return 0;
}

function toInt(v: string | undefined, fallback: number, flag: string): number {
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${flag} must be a positive number`);
  return n;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  },
);
