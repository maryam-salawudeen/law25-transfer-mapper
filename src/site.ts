import { getDomain, getHostname } from "tldts";

/** The registrable domain ("eTLD+1") of a host or URL, e.g. "www.example.co.uk" -> "example.co.uk". */
export function registrableDomain(hostOrUrl: string): string {
  const host = (getHostname(hostOrUrl) ?? hostOrUrl).toLowerCase();
  return getDomain(host) ?? host;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isFirstParty(hostOrUrl: string, firstPartySites: string[]): boolean {
  return firstPartySites.includes(registrableDomain(hostOrUrl));
}

/** True when `host` is `suffix` or a subdomain of it. */
export function hostMatches(host: string, suffix: string): boolean {
  const h = host.toLowerCase();
  const s = suffix.toLowerCase();
  return h === s || h.endsWith("." + s);
}

/** Strips the query string and fragment so identifier values are never stored. */
export function stripQuery(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url.split(/[?#]/)[0] ?? url;
  }
}
