import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ACT_URL, CAI_PIA_GUIDE_URL, DISCLAIMER, OUTSIDE_QUEBEC_NOTE, SECTIONS, type SectionId } from "./law.js";
import { CATEGORY_PURPOSE } from "./vendors.js";
import type { Analysis, Flow, OutsideQuebec } from "./types.js";

export interface ReportPaths {
  html: string;
  json: string;
  csv: string;
  pia: string;
}

export function writeReports(a: Analysis, outDir: string): ReportPaths {
  mkdirSync(outDir, { recursive: true });
  const paths: ReportPaths = {
    html: join(outDir, "report.html"),
    json: join(outDir, "report.json"),
    csv: join(outDir, "inventory.csv"),
    pia: join(outDir, "pia-draft.md"),
  };
  writeFileSync(paths.html, renderHtml(a));
  writeFileSync(paths.json, JSON.stringify(toJson(a), null, 2));
  writeFileSync(paths.csv, renderCsv(a));
  writeFileSync(paths.pia, renderPia(a));
  return paths;
}

export function summarize(a: Analysis) {
  const flows = a.flows;
  return {
    thirdParties: flows.length,
    outsideQuebec: flows.filter((f) => f.outsideQuebec === "yes").length,
    unknownLocation: flows.filter((f) => f.outsideQuebec === "unknown").length,
    high: flows.filter((f) => f.severity === "high").length,
    profilingBeforeChoice: flows.filter((f) => f.signals.some((s) => s.id === "profiling-before-choice")).length,
    unidentified: flows.filter((f) => !f.vendor).length,
    pagesVisited: a.crawl.pages.length,
  };
}

export function toJson(a: Analysis) {
  return {
    tool: "law25-transfer-mapper",
    disclaimer: DISCLAIMER,
    org: a.org,
    generatedAt: a.generatedAt,
    summary: summarize(a),
    site: {
      startUrl: a.crawl.startUrl,
      firstPartySites: a.crawl.firstPartySites,
      startedAt: a.crawl.startedAt,
      finishedAt: a.crawl.finishedAt,
      userAgent: a.crawl.userAgent,
      pages: a.crawl.pages,
      skippedByRobots: a.crawl.skippedByRobots,
    },
    flows: a.flows.map((f) => ({
      label: f.label,
      vendorId: f.vendor?.id ?? null,
      operator: f.vendor?.operator ?? null,
      category: f.category,
      purpose: CATEGORY_PURPOSE[f.category],
      headquarters: f.destination,
      outsideQuebec: f.outsideQuebec,
      severity: f.severity,
      hosts: f.hosts,
      requestCount: f.requestCount,
      postCount: f.postCount,
      pages: f.pages,
      resourceTypes: f.resourceTypes,
      queryKeys: f.queryKeys,
      idParams: f.idParams,
      contactParams: f.contactParams,
      emailInUrl: f.emailInUrl,
      emailInBody: f.emailInBody,
      thirdPartyCookies: f.thirdPartyCookies,
      firstPartyCookies: f.firstPartyCookies,
      forms: f.forms,
      profiling: f.profiling,
      signals: f.signals,
    })),
    sections: SECTIONS,
  };
}

// ---------- CSV ----------

export function renderCsv(a: Analysis): string {
  const header = [
    "third_party",
    "operator",
    "category",
    "purpose",
    "headquarters",
    "outside_quebec",
    "severity",
    "hosts",
    "requests",
    "pages",
    "cookies",
    "id_params",
    "contact_params",
    "email_sent",
    "forms_to_third_party",
    "profiling_before_choice",
    "signals",
  ];
  const rows = a.flows.map((f) => [
    f.label,
    f.vendor?.operator ?? "Unidentified",
    f.category,
    CATEGORY_PURPOSE[f.category],
    f.destination,
    f.outsideQuebec,
    f.severity,
    f.hosts.join(" "),
    String(f.requestCount),
    String(f.pages.length),
    [...f.thirdPartyCookies, ...f.firstPartyCookies].join(" "),
    f.idParams.join(" "),
    f.contactParams.join(" "),
    f.emailInUrl || f.emailInBody ? "yes" : "no",
    String(f.forms.length),
    f.signals.some((s) => s.id === "profiling-before-choice") ? "yes" : "no",
    f.signals.map((s) => s.id).join(" "),
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

function csvCell(v: string): string {
  // Neutralise spreadsheet formulas, then quote.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

// ---------- PIA draft (Markdown) ----------

const OQ_TEXT: Record<OutsideQuebec, string> = {
  yes: "Yes, based on where the company is headquartered. Confirm the processing location in the DPA.",
  confirm: "Headquartered in Québec. Confirm where the data is actually processed and stored, which may be elsewhere.",
  unknown: "Unknown. Find out who operates this service and where the data goes.",
};

export function renderPia(a: Analysis): string {
  const org = a.org ?? "[Organization name]";
  const site = a.crawl.startUrl;
  const date = a.generatedAt.slice(0, 10);
  const L: string[] = [];
  const sec = (id: SectionId) => SECTIONS[id].label;

  L.push(`# Privacy impact assessment draft: communications outside Québec`);
  L.push("");
  L.push(`**Organization:** ${org}  `);
  L.push(`**Website assessed:** ${site}  `);
  L.push(`**Automated scan date:** ${date} (${a.crawl.pages.length} page(s) visited, no consent banner clicked)  `);
  L.push(`**Prepared by:** [Name, role]  `);
  L.push(`**Person in charge of the protection of personal information consulted:** [Name, date]`);
  L.push("");
  L.push(`> ${DISCLAIMER}`);
  L.push("");
  L.push(`## How to use this draft`);
  L.push("");
  L.push(
    `This draft was pre-filled from what the website sent to other organizations during an automated visit. Anything in [square brackets] needs your input. ${sec("s17")} requires an assessment before personal information is communicated outside Québec, covering four factors for each recipient. ${sec("s3_3")} says the depth of an assessment should be proportionate to the sensitivity, purposes, quantity, distribution and medium of the information, so a font CDN needs far less than a session recording tool. ${OUTSIDE_QUEBEC_NOTE}`,
  );
  L.push("");
  L.push(`The Commission d'accès à l'information publishes a guide to privacy impact assessments: ${CAI_PIA_GUIDE_URL}`);
  L.push("");

  L.push(`## Summary of recipients`);
  L.push("");
  L.push(`| Recipient | Purpose | Headquarters | Outside Québec? | Priority |`);
  L.push(`| --- | --- | --- | --- | --- |`);
  for (const f of a.flows) {
    L.push(`| ${md(f.label)} | ${md(CATEGORY_PURPOSE[f.category])} | ${md(f.destination)} | ${f.outsideQuebec} | ${f.severity} |`);
  }
  L.push("");

  L.push(`## Transparency (${sec("s8")}, ${sec("s8_1")}, ${sec("s8_2")})`);
  L.push("");
  L.push(`- [ ] The privacy policy is published on the website in clear and simple language (${sec("s8_2")}).`);
  L.push(`- [ ] The policy names the third persons, or categories of third persons, that personal information is communicated to (${sec("s8")}).`);
  L.push(`- [ ] The policy says the information could be communicated outside Québec (${sec("s8")}).`);
  const profilers = a.flows.filter((f) => f.signals.some((s) => s.id === "profiling-before-choice"));
  if (profilers.length > 0) {
    L.push(
      `- [ ] People are informed before any of these tools that can identify, locate or profile them run, and told how to activate those functions (${sec("s8_1")}): ${profilers.map((f) => f.label).join(", ")}. During the scan they loaded before any choice was made.`,
    );
  } else {
    L.push(`- [ ] People are informed before any technology that can identify, locate or profile them is used (${sec("s8_1")}). None was seen during the scan.`);
  }
  L.push("");

  L.push(`## Assessment by recipient`);
  L.push("");
  for (const f of a.flows) renderPiaFlow(L, f);

  L.push(`## Sign-off`);
  L.push("");
  L.push(`- Assessment completed by: [Name, role, date]`);
  L.push(`- Reviewed by the person in charge of the protection of personal information: [Name, date]`);
  L.push(`- Next review: [Date, or when a tool is added or changed]`);
  L.push("");
  L.push(`## Sources`);
  L.push("");
  L.push(`- Act respecting the protection of personal information in the private sector (CQLR c. P-39.1): ${ACT_URL}`);
  L.push(`- CAI, privacy impact assessment guide: ${CAI_PIA_GUIDE_URL}`);
  L.push("");
  return L.join("\n");
}

function renderPiaFlow(L: string[], f: Flow): void {
  const sec = (id: SectionId) => SECTIONS[id].label;
  L.push(`### ${md(f.label)}`);
  L.push("");
  L.push(`- **Operator:** ${f.vendor ? md(f.vendor.operator) : "[Unidentified: find out who operates " + md(f.hosts.join(", ")) + "]"}`);
  L.push(`- **Domains seen:** ${md(f.hosts.join(", ") || "none")}`);
  L.push(`- **Headquarters:** ${md(f.destination)}`);
  L.push(`- **Outside Québec?** ${OQ_TEXT[f.outsideQuebec]}`);
  L.push(`- **Contracting entity and processing location from the DPA:** [Entity, country or region]`);
  if (f.vendor?.privacyUrl) L.push(`- **Vendor privacy policy:** ${f.vendor.privacyUrl}`);
  if (f.vendor?.note) L.push(`- **Note:** ${md(f.vendor.note)}`);
  L.push(`- **Seen on:** ${f.pages.length} page(s), ${f.requestCount} request(s)`);
  L.push("");
  if (f.signals.length > 0) {
    L.push(`**What the scan found**`);
    L.push("");
    for (const s of f.signals) {
      L.push(`- **${s.severity.toUpperCase()}: ${md(s.title)}.** ${md(s.detail)} (${s.sections.map((id) => sec(id as SectionId)).join(", ")})`);
    }
    L.push("");
  }

  const observed: string[] = ["IP address and browser details (sent with every request)"];
  if (f.idParams.length || f.thirdPartyCookies.length || f.firstPartyCookies.length) {
    observed.push(`Online identifiers (${[...f.idParams, ...f.thirdPartyCookies, ...f.firstPartyCookies].slice(0, 12).join(", ")})`);
  }
  if (f.contactParams.length) observed.push(`Contact details, possibly hashed (${f.contactParams.join(", ")})`);
  if (f.emailInUrl || f.emailInBody) observed.push("Email address");
  if (f.category === "session-replay") observed.push("Clicks, scrolling and possibly what people type");
  for (const form of f.forms) observed.push(`Form fields from ${form.pageUrl}: ${form.inputs.map((i) => i.name || i.type).join(", ") || "none named"}`);

  L.push(`**Factor 1: Sensitivity of the information** (${sec("s17")}, para. 1(1))`);
  L.push("");
  L.push(`Seen during the scan:`);
  for (const o of observed) L.push(`- ${md(o)}`);
  L.push(`- [Other information sent after login, checkout or consent, which this scan can't see]`);
  L.push(`- [Is any of it sensitive, for example health, financial, biometric or about children? Explain.]`);
  L.push("");
  L.push(`**Factor 2: Purposes** (${sec("s17")}, para. 1(2))`);
  L.push("");
  L.push(`- Likely purpose: ${CATEGORY_PURPOSE[f.category]}.`);
  L.push(`- [Confirm why your organization uses this service, and whether the vendor also uses the data for its own purposes.]`);
  L.push("");
  L.push(`**Factor 3: Protection measures, including contractual ones** (${sec("s17")}, para. 1(3))`);
  L.push("");
  L.push(`- [Data processing agreement in place? Name and date.]`);
  L.push(`- [Encryption in transit and at rest; access controls; certifications such as SOC 2 or ISO/IEC 27001]`);
  L.push(`- [How long the vendor keeps the data, and how it is deleted]`);
  L.push(`- [Sub-processors, and how you are told about changes]`);
  if (f.category === "session-replay") L.push(`- [Are form fields and text masked in recordings?]`);
  L.push("");
  L.push(`**Factor 4: Legal framework where the information goes** (${sec("s17")}, para. 1(4))`);
  L.push("");
  L.push(`- Destination: ${f.outsideQuebec === "unknown" ? "[Unknown]" : md(f.destination) + " (headquarters; confirm processing location)"}`);
  L.push(`- [Privacy laws that apply there, and how they compare with generally recognized principles for protecting personal information]`);
  L.push(`- [Government access to data in that jurisdiction, and remedies available to people]`);
  L.push("");
  L.push(`**Conclusion**`);
  L.push("");
  L.push(`- [ ] The information would receive adequate protection, in particular in light of generally recognized principles (${sec("s17")}, para. 2).`);
  L.push(`- [Conditions or risk-reduction measures, if any]`);
  L.push("");
  L.push(`**Written agreement** (${sec("s17")}, para. 3)`);
  L.push("");
  L.push(`- [ ] The communication is covered by a written agreement.`);
  L.push(`- [ ] The agreement takes the results of this assessment into account.`);
  L.push(`- [ ] It includes the terms agreed to reduce the risks identified.`);
  L.push("");
  L.push(`**If this vendor acts on your behalf (mandate or service contract)** (${sec("s18_3")})`);
  L.push("");
  L.push(`- [ ] The mandate or contract is in writing.`);
  L.push(`- [ ] It specifies the measures the vendor must take to protect confidentiality.`);
  L.push(`- [ ] The information is used only to carry out the mandate or contract.`);
  L.push(`- [ ] The vendor doesn't keep the information after the contract ends.`);
  L.push(`- [ ] The vendor must notify you without delay of any violation or attempted violation of confidentiality.`);
  L.push(`- [ ] You can verify the vendor's confidentiality measures.`);
  L.push("");
}

function md(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

// ---------- HTML ----------

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const OQ_LABEL: Record<OutsideQuebec, string> = { yes: "Outside Québec", confirm: "Québec HQ: confirm", unknown: "Unknown" };

export function renderHtml(a: Analysis): string {
  const s = summarize(a);
  const site = a.crawl.startUrl;
  const date = a.generatedAt.slice(0, 10);
  const sec = (id: string) => SECTIONS[id as SectionId]?.label ?? id;

  const rows = a.flows
    .map(
      (f) => `<tr>
  <td><a href="#${esc(f.key)}">${esc(f.label)}</a>${f.vendor ? "" : ` <span class="tag warn">Unidentified</span>`}</td>
  <td>${esc(CATEGORY_PURPOSE[f.category])}</td>
  <td>${esc(f.destination)}</td>
  <td><span class="tag oq-${f.outsideQuebec}">${OQ_LABEL[f.outsideQuebec]}</span></td>
  <td><span class="sev sev-${f.severity}">${f.severity}</span></td>
  <td class="num">${f.requestCount}</td>
</tr>`,
    )
    .join("\n");

  const details = a.flows
    .map((f) => {
      const facts: [string, string][] = [
        ["Operator", f.vendor?.operator ?? "Unidentified: find out who operates this"],
        ["Headquarters", f.destination],
        ["Domains", f.hosts.join(", ") || "none"],
        ["Requests", `${f.requestCount} on ${f.pages.length} page(s)${f.postCount ? `, ${f.postCount} with a body` : ""}`],
        ["Resource types", f.resourceTypes.join(", ") || "none"],
        ["Query parameter names", f.queryKeys.slice(0, 40).join(", ") || "none"],
        ["Cookies", [...f.thirdPartyCookies, ...f.firstPartyCookies].join(", ") || "none"],
      ];
      if (f.vendor?.privacyUrl) facts.push(["Privacy policy", f.vendor.privacyUrl]);
      if (f.vendor?.note) facts.push(["Note", f.vendor.note]);
      const signals = f.signals
        .map(
          (x) =>
            `<li><span class="sev sev-${x.severity}">${x.severity}</span> <strong>${esc(x.title)}.</strong> ${esc(x.detail)} <span class="cite">${x.sections.map(sec).join(", ")}</span></li>`,
        )
        .join("");
      return `<details id="${esc(f.key)}" class="flow">
  <summary><span class="sev sev-${f.severity}">${f.severity}</span> ${esc(f.label)} <span class="muted">· ${esc(f.destination)}</span></summary>
  <dl>${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${/^https?:\/\//.test(v) ? `<a href="${esc(v)}" rel="noreferrer">${esc(v)}</a>` : esc(v)}</dd>`).join("")}</dl>
  <ul class="signals">${signals}</ul>
</details>`;
    })
    .join("\n");

  const sections = Object.values(SECTIONS)
    .map((x) => `<li><strong>${esc(x.label)}</strong> ${esc(x.summary)}</li>`)
    .join("");

  const pages = a.crawl.pages
    .map((p) => `<li>${esc(p.url)} ${p.status ? `<span class="muted">${p.status}</span>` : ""}${p.error ? ` <span class="tag warn">${esc(p.error)}</span>` : ""}</li>`)
    .join("");

  const next: string[] = [];
  if (s.high > 0) next.push(`Start with the ${s.high} high-priority third part${s.high === 1 ? "y" : "ies"}: email addresses, contact details, forms or session recording.`);
  if (s.profilingBeforeChoice > 0) next.push(`${s.profilingBeforeChoice} tool(s) that can identify or profile visitors loaded before any choice was made. Review your consent banner and tag settings (${sec("s8_1")}).`);
  if (s.unidentified > 0) next.push(`Find out who operates the ${s.unidentified} unidentified domain(s).`);
  next.push(`For each recipient outside Québec, complete the four factors in <code>pia-draft.md</code> and check that a written agreement covers it (${sec("s17")}).`);
  next.push(`Check that your privacy policy names these recipients and says information could be communicated outside Québec (${sec("s8")}).`);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Law 25 transfer map</title>
<style>
:root { --bg:#fbfaf7; --fg:#1d1f21; --muted:#5f6368; --line:#e3e0d8; --card:#ffffff; --accent:#1f4e79;
  --high:#b3261e; --high-bg:#fdecea; --med:#8a5a00; --med-bg:#fff4dc; --low:#2e6b3a; --low-bg:#e8f3ea; }
@media (prefers-color-scheme: dark) { :root { --bg:#141517; --fg:#e8e6e1; --muted:#a3a39e; --line:#2c2e31; --card:#1c1d20; --accent:#8fb8de;
  --high:#ffb4ab; --high-bg:#3b1a17; --med:#f3c46b; --med-bg:#33280f; --low:#9ed4a8; --low-bg:#17291b; } }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif; }
main { max-width:1080px; margin:0 auto; padding:32px 16px 64px; }
h1 { font-size:28px; margin:0 0 4px; letter-spacing:-0.01em; }
h2 { font-size:19px; margin:40px 0 12px; }
a { color:var(--accent); }
.muted { color:var(--muted); }
.note { border-left:3px solid var(--accent); padding:10px 14px; background:var(--card); margin:20px 0; }
.cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-top:20px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:14px; }
.card b { display:block; font-size:26px; font-variant-numeric:tabular-nums; }
.table-wrap { overflow-x:auto; border:1px solid var(--line); border-radius:8px; background:var(--card); }
table { border-collapse:collapse; width:100%; min-width:720px; }
th, td { text-align:left; padding:9px 12px; border-bottom:1px solid var(--line); vertical-align:top; }
th { font-size:13px; color:var(--muted); font-weight:600; }
tr:last-child td { border-bottom:0; }
.num { text-align:right; font-variant-numeric:tabular-nums; }
.sev, .tag { display:inline-block; font-size:12px; font-weight:600; padding:1px 8px; border-radius:99px; white-space:nowrap; }
.sev-high { color:var(--high); background:var(--high-bg); } .sev-medium { color:var(--med); background:var(--med-bg); } .sev-low { color:var(--low); background:var(--low-bg); }
.tag { background:var(--line); color:var(--fg); font-weight:500; } .tag.warn, .oq-unknown { color:var(--med); background:var(--med-bg); }
.oq-yes { color:var(--accent); background:transparent; border:1px solid var(--accent); }
.flow { background:var(--card); border:1px solid var(--line); border-radius:8px; margin:8px 0; padding:0 14px; }
.flow summary { cursor:pointer; padding:12px 0; font-weight:600; }
dl { display:grid; grid-template-columns:200px 1fr; gap:4px 16px; margin:0 0 12px; }
dt { color:var(--muted); } dd { margin:0; overflow-wrap:anywhere; }
@media (max-width:640px) { dl { grid-template-columns:1fr; } dt { margin-top:8px; } }
.signals { padding-left:18px; } .signals li { margin:6px 0; }
.cite { color:var(--muted); font-size:13px; white-space:nowrap; }
code { background:var(--line); padding:1px 5px; border-radius:4px; }
footer { margin-top:48px; color:var(--muted); font-size:13px; }
</style>
</head>
<body>
<main>
<h1>Law 25 transfer map</h1>
<div class="muted">${esc(a.org ? a.org + " · " : "")}${esc(site)} · scanned ${esc(date)} · ${s.pagesVisited} page(s), no consent banner clicked</div>
<p class="note">${esc(DISCLAIMER)}</p>

<div class="cards">
  <div class="card"><b>${s.thirdParties}</b>third parties received data</div>
  <div class="card"><b>${s.outsideQuebec}</b>headquartered outside Québec</div>
  <div class="card"><b>${s.high}</b>high priority</div>
  <div class="card"><b>${s.profilingBeforeChoice}</b>can profile, loaded before any choice</div>
  <div class="card"><b>${s.unidentified}</b>unidentified</div>
</div>

<h2>What to do next</h2>
<ol>${next.map((n) => `<li>${n}</li>`).join("")}</ol>

<h2>Recipients</h2>
<div class="table-wrap"><table>
<thead><tr><th>Third party</th><th>Likely purpose</th><th>Headquarters</th><th>Location</th><th>Priority</th><th class="num">Requests</th></tr></thead>
<tbody>
${rows || `<tr><td colspan="6">No third-party requests were seen.</td></tr>`}
</tbody></table></div>
<p class="muted">Headquarters is a starting point, not the processing location. Confirm where each vendor processes and stores data in its data processing agreement. ${esc(OUTSIDE_QUEBEC_NOTE)}</p>

<h2>Details</h2>
${details}

<h2>Legal basis</h2>
<p>Act respecting the protection of personal information in the private sector, <a href="${ACT_URL}" rel="noreferrer">CQLR c. P-39.1</a>, as amended by Law 25. Summaries are paraphrased; the official text governs.</p>
<ul>${sections}</ul>

<h2>How this scan works, and what it can't see</h2>
<ul>
<li>A headless Chromium browser visited up to ${s.pagesVisited} page(s) on the site, following links on the same site and respecting robots.txt. It recorded every request to another domain, the cookies set, and where forms submit.</li>
<li>No consent banner was clicked, so this shows what loads before a visitor chooses. Tools that load only after consent, after login or at checkout aren't shown.</li>
<li>Query string values and request bodies were never stored. Only parameter names, and whether an email address appeared, were recorded.</li>
<li>Requests made from the server, emails, CRM exports and other back-office transfers aren't visible to a browser and need their own inventory.</li>
<li>Headquarters comes from a curated list of known vendors in <code>data/vendors.json</code>. It is not where the data is processed.</li>
</ul>

<h2>Pages visited</h2>
<ul>${pages}</ul>
${a.crawl.skippedByRobots.length ? `<p class="muted">Skipped because of robots.txt: ${a.crawl.skippedByRobots.map(esc).join(", ")}</p>` : ""}

<footer>Generated by law25-transfer-mapper on ${esc(a.generatedAt)}. Browser: ${esc(a.crawl.userAgent)}</footer>
</main>
</body>
</html>
`;
}
