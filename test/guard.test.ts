import { describe, expect, it } from "vitest";
import { checkScanTarget, isPrivateAddress, isPublicHost } from "../src/guard.js";
import { handleScan } from "../src/web.js";

describe("network guard", () => {
  it("recognises non-public addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("refuses local and internal hostnames without a DNS lookup", async () => {
    expect(await isPublicHost("localhost")).toBe(false);
    expect(await isPublicHost("printer.local")).toBe(false);
    expect(await isPublicHost("intranet")).toBe(false);
    expect(await isPublicHost("[::1]")).toBe(false);
  });

  it("rejects unsafe scan targets with a readable reason", async () => {
    await expect(checkScanTarget("http://127.0.0.1:3000/")).rejects.toThrow(/standard web ports/);
    await expect(checkScanTarget("http://169.254.169.254/latest/meta-data")).rejects.toThrow(/public website/);
    await expect(checkScanTarget("ftp://example.com")).rejects.toThrow();
    await expect(checkScanTarget("https://user:pw@example.com")).rejects.toThrow(/username/);
  });
});

describe("web handler", () => {
  const post = (body: unknown, ip = "203.0.113.9") =>
    handleScan(new Request("http://x/api/scan", { method: "POST", headers: { "x-real-ip": ip }, body: JSON.stringify(body) }));

  it("rejects bad input before starting a browser", async () => {
    expect((await handleScan(new Request("http://x/api/scan"))).status).toBe(405);
    expect((await post({})).status).toBe(400);
    const res = await post({ url: "http://localhost/" }, "203.0.113.10");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/public website/);
  });

  it("limits how many scans one visitor can start", async () => {
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await post({ url: "http://localhost/" }, "203.0.113.11")).status);
    expect(statuses.slice(0, 5).every((s) => s === 400)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});
