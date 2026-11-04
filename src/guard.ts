// Network guard for the hosted scanner: it must only ever reach the public internet.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { BrowserContext } from "playwright";

export class BlockedUrlError extends Error {}

const BLOCKED_HOSTNAMES = /(?:^|\.)(?:localhost|local|internal|intranet|lan|home|corp|localdomain)$/i;

/** True for loopback, private, link-local, carrier-grade NAT, multicast and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return /^(?:fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
  }
  return true;
}

const cache = new Map<string, Promise<boolean>>();

/** Resolves a hostname and reports whether every address it points to is public. */
export function isPublicHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host)) return Promise.resolve(!isPrivateAddress(host));
  if (!host.includes(".") || BLOCKED_HOSTNAMES.test(host)) return Promise.resolve(false);
  let result = cache.get(host);
  if (!result) {
    result = lookup(host, { all: true })
      .then((addrs) => addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address)))
      .catch(() => false);
    cache.set(host, result);
  }
  return result;
}

/** Checks a URL someone typed into the web form. Throws a BlockedUrlError with a readable message. */
export async function checkScanTarget(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new BlockedUrlError("That doesn't look like a website address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new BlockedUrlError("Only http and https addresses can be scanned.");
  if (url.username || url.password) throw new BlockedUrlError("Addresses with a username or password can't be scanned.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new BlockedUrlError("Only standard web ports can be scanned.");
  if (!(await isPublicHost(url.hostname))) throw new BlockedUrlError("That address isn't a public website.");
  return url;
}

/** Aborts any browser request to a non-public address, including ones a scanned page tries to reach. */
export async function guardContext(context: BrowserContext): Promise<void> {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "data:" || url.protocol === "blob:") return route.continue();
    if ((url.protocol === "http:" || url.protocol === "https:") && (await isPublicHost(url.hostname))) return route.continue();
    return route.abort("blockedbyclient");
  });
}
