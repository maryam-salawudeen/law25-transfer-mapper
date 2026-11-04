// Local stand-in for Vercel: serves public/ and runs /api/scan with Playwright's own Chromium.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { handleScan } from "../src/web.js";

const port = Number(process.env.PORT ?? 3000);

createServer(async (req, res) => {
  if (req.url === "/api/scan") {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const request = new Request(`http://localhost${req.url}`, {
      method: req.method,
      headers: { "content-type": "application/json", "x-real-ip": req.socket.remoteAddress ?? "local" },
      body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
    });
    const response = await handleScan(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    return void res.end(await response.text());
  }
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return void res.end(await readFile(new URL("../public/index.html", import.meta.url)));
  }
  res.writeHead(404).end("Not found");
}).listen(port, () => console.log(`Law 25 Transfer Mapper on http://localhost:${port}`));
