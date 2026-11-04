# Law 25 Transfer Mapper

Find out which organizations your website sends personal information to, where they are, and draft the privacy impact assessment Québec's Law 25 requires before personal information leaves the province.

```bash
npm run map -- https://www.example.ca --org "Example Inc."
```

The tool opens your site in a real browser, visits up to 10 pages without clicking the consent banner, and records every request to another domain. It then writes four files:

| File | What it's for |
| --- | --- |
| `report.html` | A readable report: every recipient, where it's headquartered, what was sent, and what to do first |
| `pia-draft.md` | A privacy impact assessment draft, with the four factors of s. 17 for each recipient, pre-filled where the scan knows the answer and [bracketed] where you need to fill it in, plus the s. 17 written-agreement and s. 18.3 mandate checklists |
| `inventory.csv` | One row per recipient, for your records or a spreadsheet |
| `report.json` | Everything, for other tools |

> **This tool is informational and is not legal advice.** It shows what a website sent during an automated visit. It can't see what happens to the data afterwards, where it's processed, or what your contracts say.

## Why

Since September 2023, an enterprise must carry out a privacy impact assessment **before** communicating personal information outside Québec, and that includes other Canadian provinces ([s. 17](https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1)). The first step is knowing every transfer that happens. Practitioner guidance says to start by mapping them all, but a typical website quietly sends visitors' information to a dozen or more companies through analytics, ad pixels, fonts, chat widgets and embedded forms, and nobody keeps that list up to date.

This tool builds that list from what the site actually does.

## What it checks

For each third party it finds, the tool records:

- **Who it is and where it's headquartered**, from a curated list of 90+ common vendors in [`data/vendors.json`](data/vendors.json). Unknown domains are flagged as *Unidentified: find out who operates this*.
- **Whether it's outside Québec.** Vendors headquartered outside Québec, including in Ontario or British Columbia, are marked as outside Québec. Vendors headquartered in Québec are marked *confirm*, because their processing may still happen elsewhere.
- **What was sent:** visitor and ad-click identifiers (`cid`, `gclid`, `fbclid` and so on), contact-detail parameters (`em`, `email`, `ud[em]` and others, often hashed), email addresses in URLs or request bodies, cookies (including first-party cookies like `_ga` that belong to a vendor's script), and forms that submit straight to a third party.
- **Tracking before any choice.** Analytics, advertising, session-replay and similar tools that load before a visitor has clicked anything are flagged under [s. 8.1](https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1), which requires informing people before using technology that can identify, locate or profile them.

Each finding is ranked high, medium or low, and cites the section it relates to.

## Legal basis

All references are to the *Act respecting the protection of personal information in the private sector*, [CQLR c. P-39.1](https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1), as amended by Law 25 (2021, c. 25). The summaries in [`src/law.ts`](src/law.ts) are paraphrased and were checked against the consolidated text current to 15 October 2026.

| Section | What the tool uses it for |
| --- | --- |
| s. 3.3 | Assessments must be proportionate, so the draft says a font CDN needs less work than a session recorder |
| s. 8 | Privacy-policy checklist: name the recipients and say information may go outside Québec |
| s. 8.1 | Flags tools that can identify, locate or profile visitors and load before any choice |
| s. 8.2 | Privacy-policy checklist: published in clear and simple language |
| s. 10 | Security measures: an email address in a URL ends up in logs |
| s. 17 | The four factors (sensitivity, purposes, protection measures, legal framework), the adequate-protection test and the written agreement |
| s. 18.3 | Checklist for service providers acting on your behalf |

The Commission d'accès à l'information publishes a [guide to privacy impact assessments](https://www.cai.gouv.qc.ca/uploads/pdfs/CAI_GU_EFVP.pdf).

## Install and run

You need Node.js 20 or later.

```bash
git clone https://github.com/maryam-salawudeen/law25-transfer-mapper.git
cd law25-transfer-mapper
npm install
npx playwright install chromium
npm run map -- https://www.example.ca --org "Example Inc." --max-pages 20
```

Options:

| Option | Default | What it does |
| --- | --- | --- |
| `--max-pages <n>` | 10 | Pages to visit on the same site |
| `--out <dir>` | `reports/<host>-<date>` | Where to write the reports |
| `--org <name>` | | Your organization's name, for the reports |
| `--first-party <list>` | | Other domains you own, such as your CDN, comma separated |
| `--wait <ms>` | 4000 | How long to wait on each page for delayed tags |
| `--timeout <ms>` | 30000 | Page load timeout |
| `--ignore-robots` | off | Ignore robots.txt. Only use this on sites you're responsible for. |
| `--headed` | off | Show the browser window |

## Limitations

Read these before you rely on a report.

- **Headquarters isn't the processing location.** A US company may process Canadian data in Canada, and a Canadian company may process it in the US. Confirm the contracting entity and processing location in each vendor's data processing agreement.
- **Before consent only.** The scan never clicks a consent banner, logs in or checks out. Tools that load only after those steps won't appear. Run the scan again on those flows by hand if you need them.
- **Browser only.** Server-to-server transfers (your CRM, email platform, payroll, backups, support tools) aren't visible to a browser and need their own inventory.
- **A sample, not every page.** The scan follows links on the same site up to `--max-pages`. Pages it didn't reach can load other tools.
- **Detection is heuristic.** Parameter names like `em` usually carry hashed emails, but not always. Each finding says what was seen so you can check it.
- **The vendor list is curated by hand** and can be out of date. Corrections with sources are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Privacy of the tool itself

The scan stores the address and path of each request but **never query string values or request bodies**. It keeps only the parameter names, and whether an email address appeared. Reports stay on your computer. The browser identifies itself with `law25-transfer-mapper/0.1` in its user agent, and the tool respects robots.txt by default.

## How it compares

| Tool | What it does | Difference |
| --- | --- | --- |
| Commercial cookie scanners (OneTrust, Cookiebot and others) | Scan for cookies to fill a consent banner | Cookie-focused and proprietary. They don't map destinations to Law 25 or draft the s. 17 assessment. |
| General privacy guides and PIA templates | Explain what an assessment should cover | You start from a blank page. This tool pre-fills it from what your site actually does. |
| Browser developer tools | Show network requests | Manual, one page at a time, with no vendor or location information |

As far as we know, no other open source tool maps website transfers to Law 25's s. 17 requirements. If you know of one, please open an issue.

## Development

```bash
npm test          # unit tests and an offline browser test
npm run typecheck
npm run build     # compiles to dist/
```

The project layout:

- `src/crawl.ts` drives the browser.
- `src/analyze.ts` groups requests by vendor and raises findings.
- `src/report.ts` writes the four outputs.
- `src/law.ts` holds the section summaries.
- `data/vendors.json` holds the vendor list.

## Licence

MIT. See [LICENSE](LICENSE).
