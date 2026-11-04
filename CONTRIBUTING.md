# Contributing

Thanks for helping. The most useful contributions are vendor entries, corrections, and reports of sites where the scan missed or misread something.

## Adding or correcting a vendor

Vendors live in [`data/vendors.json`](data/vendors.json). Each entry looks like this:

```json
{
  "id": "example-analytics",
  "name": "Example Analytics",
  "operator": "Example Analytics Inc.",
  "website": "https://example-analytics.com/",
  "privacyUrl": "https://example-analytics.com/privacy",
  "category": "analytics",
  "domains": ["example-analytics.com", "exa-cdn.net"],
  "cookies": ["_exa", "_exa_*"],
  "hq": { "country": "CA", "region": "ON" },
  "note": "Optional, short, factual."
}
```

The rules:

1. **Cite a source in your pull request** for the operator and headquarters, such as the vendor's legal page, privacy policy, DPA or an official company registry. Don't rely on memory or a blog post.
2. **Headquarters only.** `hq` is where the operating company is headquartered: an ISO 3166-1 alpha-2 country, plus a province code for Canada. If you're not sure, use `"hq": null` and explain in `note`. Never guess.
3. **No compliance claims.** Don't add claims about certifications, adequacy, the EU-US Data Privacy Framework or where data is processed. Those change, and each organization has to check them in its own contract.
4. **Domains** are host suffixes, so `example.com` also matches `cdn.example.com`. Add a path (`google.com/recaptcha`) only when one domain serves several products. The tests fail if a domain is listed twice.
5. **Categories** decide the purpose shown in reports and whether the tool counts as able to profile (s. 8.1). If a vendor is genuinely cookieless and identifier-free, set `"profiling": false` and say so in `note`, quoting the vendor's own claim.
6. Run `npm test` before opening the pull request.

## Code changes

- Keep legal statements in [`src/law.ts`](src/law.ts) paraphrased and tied to a section. If you change one, link the official text in your pull request.
- Never store query string values or request bodies. Detectors in [`src/detect.ts`](src/detect.ts) run during the crawl so raw values are never kept.
- Add or update tests in `test/`. The browser test runs offline by faking third-party hosts with route interception.

## Reporting a missed or wrong finding

Open an issue with the site, the request host, and what you expected. Please don't include personal information or query string values.
