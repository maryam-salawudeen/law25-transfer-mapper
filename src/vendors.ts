import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hostMatches } from "./site.js";
import type { Category, Vendor } from "./types.js";

const DATA_FILE = fileURLToPath(new URL("../data/vendors.json", import.meta.url));

// Categories whose tools can identify, locate or profile a visitor (s. 8.1) unless a vendor says otherwise.
const PROFILING_CATEGORIES: Category[] = [
  "analytics",
  "advertising",
  "session-replay",
  "experimentation",
  "marketing-automation",
  "social",
];

export const CATEGORY_PURPOSE: Record<Category, string> = {
  analytics: "Measuring visits and how people use the site",
  advertising: "Advertising, retargeting or measuring ad conversions",
  "session-replay": "Recording visitors' clicks, scrolling and typing to replay sessions",
  experimentation: "A/B testing and personalisation",
  "marketing-automation": "Tracking visitors and contacts for marketing and sales",
  "marketing-email": "Email sign-up and newsletters",
  social: "Social media embeds and sharing",
  "tag-manager": "Loading other tracking and marketing tools",
  consent: "Showing the cookie or consent banner",
  cdn: "Delivering files such as scripts and images",
  fonts: "Delivering web fonts",
  hosting: "Hosting the website or online store",
  payments: "Taking payments",
  "chat-support": "Live chat and customer support",
  forms: "Collecting form responses",
  scheduling: "Booking appointments",
  video: "Embedded video",
  maps: "Embedded maps",
  captcha: "Bot and spam protection",
  monitoring: "Error and performance monitoring",
  search: "Site search",
  reviews: "Customer reviews",
  "address-lookup": "Address autocomplete",
  avatars: "Profile pictures",
  other: "Unknown purpose",
};

export interface VendorDb {
  vendors: Vendor[];
  match(host: string, path?: string): Vendor | null;
  matchCookie(name: string): Vendor | null;
}

export function loadVendors(file = DATA_FILE): VendorDb {
  const data = JSON.parse(readFileSync(file, "utf8")) as { vendors: Vendor[] };
  return createVendorDb(data.vendors);
}

export function createVendorDb(vendors: Vendor[]): VendorDb {
  const patterns = vendors
    .flatMap((vendor) =>
      vendor.domains.map((d) => {
        const slash = d.indexOf("/");
        return slash === -1
          ? { vendor, host: d, path: "" }
          : { vendor, host: d.slice(0, slash), path: d.slice(slash) };
      }),
    )
    // The most specific pattern wins: longer hosts first, then patterns with a path.
    .sort((a, b) => b.host.length + b.path.length * 1000 - (a.host.length + a.path.length * 1000));

  return {
    vendors,
    match(host, path = "/") {
      for (const p of patterns) {
        if (hostMatches(host, p.host) && (p.path === "" || path.startsWith(p.path))) return p.vendor;
      }
      return null;
    },
    matchCookie(name) {
      for (const vendor of vendors) {
        for (const c of vendor.cookies ?? []) {
          if (c.endsWith("*") ? name.startsWith(c.slice(0, -1)) : name === c) return vendor;
        }
      }
      return null;
    },
  };
}

export function isProfiling(vendor: Vendor | null, category: Category): boolean {
  return vendor?.profiling ?? PROFILING_CATEGORIES.includes(category);
}

const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
const PROVINCES: Record<string, string> = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Québec",
  SK: "Saskatchewan",
  YT: "Yukon",
};

export function describeHq(hq: Vendor["hq"]): string {
  if (!hq) return "Not confirmed";
  const country = COUNTRY_NAMES.of(hq.country) ?? hq.country;
  if (hq.country === "CA" && hq.region) return `${PROVINCES[hq.region] ?? hq.region}, Canada`;
  return country;
}
