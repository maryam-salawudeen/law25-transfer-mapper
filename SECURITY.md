# Security policy

## Reporting a vulnerability

Please report security problems privately rather than in a public issue. Use the repository's private vulnerability reporting ("Report a vulnerability" under the Security tab), and include steps to reproduce.

## Scope

This tool runs a headless browser against websites you choose and writes reports to your disk. Issues worth reporting include:

- a scanned site being able to run code outside the browser sandbox, or write files outside the output folder;
- report files (HTML, CSV) that can run script or spreadsheet formulas from content the scanned site controls;
- query string values, request bodies or other personal information ending up in reports when they should not.

## Using the tool safely

- Scan sites you are responsible for, or have permission to assess. Respect robots.txt unless the site is yours.
- Reports can name the tools a site uses and the pages it has. Treat them as internal documents.
- Keep Playwright up to date (`npm update playwright && npx playwright install chromium`) so the browser has current security fixes.
