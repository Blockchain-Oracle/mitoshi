/**
 * Captures the running home screen at a phone viewport for the `/download` page's `PhoneShot` (a real capture, never a
 * drawing — Masayume's rule): 390×844 at 2× → `public/app/phone-home.png` (780×1688).
 *
 *   pnpm --filter @cwf/web capture:phone --base http://localhost:3101
 */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const i = process.argv.indexOf("--base");
const base = i >= 0 ? process.argv[i + 1]! : "http://localhost:3101";
mkdirSync("public/app", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "dark" });
await page.goto(`${base}/`, { waitUntil: "networkidle" });
await page.screenshot({ path: "public/app/phone-home.png" });
await browser.close();
console.log("wrote public/app/phone-home.png");
