/**
 * S13 gate: "an optimistic post that fails keeps its draft" — on the deployed build, from a CI runner. A fresh key signs
 * the social session once (in Node) and the browser carries that session; three takes on a live BTC Window use the
 * minute's allowance (3/min), so the fourth, posted from the terminal's Room drawer, shows at once, is refused by the
 * server and must keep its caption in the composer, with the failed card saying why. The key's rows are deleted after.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/s13-draft.ts --base https://mitoshi.xyz --out <dir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { deletionMessage, socialSessionMessage } from "@cwf/core";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { openTerminal } from "./lib/terminal";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "https://mitoshi.xyz");
const out = arg("out", "s13-draft-out");
mkdirSync(out, { recursive: true });
const nonce = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, "0")).join("");
const account = privateKeyToAccount(generatePrivateKey());
let cookie = "";
async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) } });
  const set = res.headers.get("set-cookie");
  if (set?.startsWith("cwf_social=")) cookie = set.split(";")[0]!;
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}
const log = (o: Record<string, unknown>) => console.log(JSON.stringify(o));
const result: Record<string, unknown> = {};

const text = socialSessionMessage({ address: account.address, network: "testnet", issuedAtSec: Math.floor(Date.now() / 1000), nonce: nonce() });
log({ step: "session", status: (await api("/api/social/session", { method: "POST", body: JSON.stringify({ text, signature: await account.signMessage({ message: text }) }) })).status });
const markets = (await (await fetch(`${base}/api/index/markets?live=${Math.floor(Date.now() / 1000)}&limit=500`)).json()) as { rows: { market: string; symbol: string; state: string; lock_at_sec: string }[] };
const live = markets.rows.find((m) => m.symbol === "BTC" && m.state === "open" && Number(m.lock_at_sec) > Date.now() / 1000 + 120)!;
for (let i = 0; i < 3; i++) log({ step: `take ${i + 1}`, status: (await api("/api/social/takes", { method: "POST", body: JSON.stringify({ marketId: live.market, side: "up", caption: `S13 gate draft check ${i + 1}` }) })).status });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
context.setDefaultTimeout(60_000);
await context.addCookies([{ name: "cwf_social", value: decodeURIComponent(cookie.split("=").slice(1).join("=")), domain: new URL(base).hostname, path: "/", httpOnly: true, secure: true, sameSite: "Lax" }]);
const page = await context.newPage();
const caption = "this caption must survive a refusal";
try {
  await openTerminal(page, base, "BTC");
  await page.getByRole("button", { name: "Open the room" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("radio", { name: "Takes" }).or(drawer.getByRole("button", { name: "Takes" })).or(drawer.getByRole("tab", { name: "Takes" })).first().click();
  await drawer.getByRole("radio", { name: "UP" }).click();
  await drawer.getByRole("textbox", { name: "Why? (optional)" }).fill(caption);
  page.on("console", (m) => m.type() === "error" && log({ console: m.text().slice(0, 200) }));
  const posted = page.waitForResponse((r) => r.url().includes("/api/social/takes") && r.request().method() === "POST", { timeout: 20_000 }).catch(() => null);
  await drawer.getByRole("button", { name: "Post take" }).click();
  const res = await posted;
  result.postStatus = res ? res.status() : "no request";
  result.postBody = res ? (await res.text().catch(() => "")).slice(0, 200) : null;
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: join(out, "after-click.png") });
  result.toasts = await page.locator("[data-sonner-toast], [role=status], [role=alert]").allInnerTexts().then((t) => t.map((x) => x.replace(/\s+/g, " ").slice(0, 120)).slice(0, 6));
  const failed = drawer.getByRole("alert").first();
  await failed.waitFor({ state: "visible", timeout: 15_000 });
  result.failedSays = (await failed.innerText()).replace(/\s+/g, " ").slice(0, 160);
  result.draftKept = (await drawer.getByRole("textbox", { name: "Why? (optional)" }).inputValue()) === caption;
  await page.screenshot({ path: join(out, "draft-kept.png") });
} catch (e) {
  result.error = String(e).slice(0, 300);
  await page.screenshot({ path: join(out, "draft-kept.png") }).catch(() => undefined);
}
await browser.close();
const del = deletionMessage({ address: account.address, network: "testnet", issuedAtSec: Math.floor(Date.now() / 1000), nonce: nonce() });
result.deleted = (await api("/api/account/data", { method: "DELETE", body: JSON.stringify({ text: del, signature: await account.signMessage({ message: del }) }) })).body.deleted;
log({ step: "draft", ...result });
writeFileSync(join(out, "s13-draft.json"), JSON.stringify(result, null, 2));
process.exitCode = result.draftKept === true ? 0 : 1;
