// Vercel function: POST /api/scan. The page and the report code live in dist/ (built from src/).
import chromiumBinary from "@sparticuz/chromium";
import { chromium } from "playwright";
import { handleScan } from "../dist/web.js";

chromiumBinary.setGraphicsMode = false;

const launch = async () =>
  chromium.launch({
    executablePath: await chromiumBinary.executablePath(),
    args: chromiumBinary.args,
    headless: true,
  });

export function POST(request) {
  return handleScan(request, { launch });
}
