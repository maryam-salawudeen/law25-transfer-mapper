export interface RequestRecord {
  /** Origin and path only. The query string is never kept, because its values can hold identifiers. */
  url: string;
  host: string;
  site: string;
  method: string;
  resourceType: string;
  pageUrl: string;
  queryKeys: string[];
  hasPostBody: boolean;
  emailInUrl: boolean;
  emailInBody: boolean;
}

export interface CookieRecord {
  name: string;
  domain: string;
  site: string;
  /** Unix seconds, or null for a session cookie. */
  expires: number | null;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
}

export interface FormInput {
  name: string;
  type: string;
}

export interface FormRecord {
  pageUrl: string;
  action: string;
  actionHost: string;
  actionSite: string;
  method: string;
  inputs: FormInput[];
}

export interface PageRecord {
  url: string;
  status: number | null;
  title: string;
  error?: string;
}

export interface CrawlResult {
  startUrl: string;
  firstPartySites: string[];
  startedAt: string;
  finishedAt: string;
  userAgent: string;
  pages: PageRecord[];
  skippedByRobots: string[];
  requests: RequestRecord[];
  cookies: CookieRecord[];
  forms: FormRecord[];
}

export type Category =
  | "analytics"
  | "advertising"
  | "session-replay"
  | "experimentation"
  | "marketing-automation"
  | "marketing-email"
  | "social"
  | "tag-manager"
  | "consent"
  | "cdn"
  | "fonts"
  | "hosting"
  | "payments"
  | "chat-support"
  | "forms"
  | "scheduling"
  | "video"
  | "maps"
  | "captcha"
  | "monitoring"
  | "search"
  | "reviews"
  | "address-lookup"
  | "avatars"
  | "other";

export interface Vendor {
  id: string;
  name: string;
  operator: string;
  website: string;
  privacyUrl?: string;
  category: Category;
  /** Host suffixes, optionally with a path prefix ("google.com/recaptcha"). */
  domains: string[];
  /** First-party cookie names set by this vendor's script. A trailing * matches a prefix. */
  cookies?: string[];
  /** Headquarters, as an ISO 3166-1 alpha-2 country and, for Canada, a province code. Null when not confirmed. */
  hq: { country: string; region?: string } | null;
  /** Overrides the category default for whether the tool can identify, locate or profile (s. 8.1). */
  profiling?: boolean;
  note?: string;
}

export type Severity = "high" | "medium" | "low";

export interface Signal {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  sections: string[];
}

export type OutsideQuebec = "yes" | "confirm" | "unknown";

export interface Flow {
  key: string;
  vendor: Vendor | null;
  label: string;
  category: Category;
  sites: string[];
  hosts: string[];
  requestCount: number;
  postCount: number;
  pages: string[];
  resourceTypes: string[];
  queryKeys: string[];
  idParams: string[];
  contactParams: string[];
  emailInUrl: boolean;
  emailInBody: boolean;
  thirdPartyCookies: string[];
  firstPartyCookies: string[];
  forms: FormRecord[];
  profiling: boolean;
  destination: string;
  outsideQuebec: OutsideQuebec;
  severity: Severity;
  signals: Signal[];
}

export interface Analysis {
  org: string | null;
  crawl: CrawlResult;
  flows: Flow[];
  firstPartyFormsToThirdParty: number;
  generatedAt: string;
}
