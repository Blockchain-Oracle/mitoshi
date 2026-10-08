/**
 * Tap → Call card latency, phase by phase (plan §2.4 "Call card ≤ 1 s p50"; D-143, D-150). A fresh passkey (Chrome
 * virtual authenticator) signs up on the target site, arms the wallet key (one more assertion), then places `--taps`
 * $1 calls on the Crypto 5m lane with zero prompts. For every tap it reads the page's own clock (performance marks,
 * converted to epoch ms) and the browser's network timings (Playwright `request.timing()`, epoch ms) and splits the
 * time into:
 *
 *   press → handler     pointerdown on the CTA → `cwf:tap:start` (React + the lifecycle dispatch)
 *   pre-send            `cwf:tap:start` → `cwf:tap:sent` (status gate, fresh quote, account reads; the RPC reads listed)
 *   fill                the relay's `eth_fillTransaction` (gas + fee fields; the relay runs its policy `validate`)
 *   sign                fill answered → the co-sign request leaves (the wallet key's WebCrypto P-256 signature)
 *   co-sign             the relay's `eth_signRawTransaction` (`validate` again + the fee payer's signature)
 *   send → receipt      `eth_sendRawTransactionSync` to the RPC (inclusion ~0.5 s + the gateway)
 *   → card              pointerdown → the Call card in the DOM (`.call-card`, pending or confirmed)
 *   → confirmed         pointerdown → the card carries the receipt (`data-call-state="confirmed"`, or any card on
 *                       builds from before the optimistic card)
 *
 * Liquidity: the testnet seed maker's books are thin (F-S4-16); run `scripts/drive/gate-maker.ts` alongside (real
 * PostOnly orders). Every tx hash is printed for `cast receipt`.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/tap-latency.ts --base https://testnet.mitoshi.xyz --taps 12 --out <dir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect, type Page, type Request } from "@playwright/test";
import { settle } from "./lib/settle";
import { phasesOf, summarize, type NetCall, type TapMarks } from "./lib/tap-phases";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "https://testnet.mitoshi.xyz");
const out = arg("out", "tap-latency-out");
const taps = Number(arg("taps", "12"));
const width = Number(arg("width", "390"));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, hasTouch: width < 768 });
// The sign-in modal waits for the wallet runtime (~1 MB) that loads on the first tap; a slow link needs the time.
context.setDefaultTimeout(90_000);
// Page-side marks on the same clock as the app's own `cwf:tap:*` marks: the press, the card, the confirmed card.
// A string, not a function: tsx's `__name` helper does not exist in the page.
await context.addInitScript(`(() => {
  const mark = (n) => { try { performance.mark(n); } catch {} };
  document.addEventListener("pointerdown", (e) => {
    const b = e.target && e.target.closest ? e.target.closest("button") : null;
    if (b && /^Buy (UP|DOWN) for \\$/.test((b.textContent || "").trim())) mark("e2e:press");
  }, true);
  let seenCard = false, seenConfirmed = false;
  new MutationObserver(() => {
    const card = document.querySelector('[aria-label="Your call"] .call-card');
    if (!card) { seenCard = false; seenConfirmed = false; return; }
    if (!seenCard) { seenCard = true; mark("e2e:card"); }
    const state = card.getAttribute("data-call-state");
    if (!seenConfirmed && (state === null || state === "confirmed")) { seenConfirmed = true; mark("e2e:confirmed"); }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-call-state"] });
})()`);
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});
let assertions = 0;
cdp.on("WebAuthn.credentialAsserted", () => { assertions += 1; });

const net: NetCall[] = [];
// The wallet's own engine events pushed over the RPC WebSocket (the D-151 chain-log path when no stream ticket).
let pushedLogs = 0;
page.on("websocket", (ws) => ws.on("framereceived", (f) => { if (String(f.payload).includes("eth_subscription")) pushedLogs += 1; }));
function rpcMethod(r: Request): string {
  try {
    const body = JSON.parse(r.postData() ?? "null") as { method?: string } | { method?: string }[] | null;
    return (Array.isArray(body) ? body.map((b) => b.method).join("+") : body?.method) ?? r.method();
  } catch { return r.method(); }
}
page.on("requestfinished", (r) => {
  const t = r.timing();
  if (t.startTime <= 0) return;
  const host = new URL(r.url()).host;
  const path = new URL(r.url()).pathname;
  const where = path.startsWith("/api/relay") ? "relay" : /rpc/.test(host) ? "rpc" : `${host}${path}`.slice(0, 60);
  net.push({ where, method: r.method() === "POST" ? rpcMethod(r) : `GET ${path.slice(0, 40)}`, startMs: t.startTime, endMs: t.startTime + Math.max(t.responseEnd, 0) });
});

async function marksOf(p: Page): Promise<TapMarks> {
  return p.evaluate(`(() => {
    const at = (n) => { const m = performance.getEntriesByName(n).at(-1); return m ? performance.timeOrigin + m.startTime : null; };
    return { press: at("e2e:press"), start: at("cwf:tap:start"), sent: at("cwf:tap:sent"), signed: at("cwf:tap:signed"), done: at("cwf:tap:done"), card: at("e2e:card"), confirmed: at("e2e:confirmed") };
  })()`) as Promise<TapMarks>;
}

async function closeTicket(p: Page) {
  if (width >= 1024) return;
  const dialog = p.getByRole("dialog");
  if (!(await dialog.count())) return;
  await p.keyboard.press("Escape");
  await expect(dialog).toBeHidden({ timeout: 5_000 }).catch(() => undefined);
}

const results: Record<string, unknown>[] = [];
async function tap(asset: string, side: "UP" | "DOWN"): Promise<boolean> {
  await page.getByRole("tab", { name: /^Crypto 5m/ }).first().click();
  const ticker = page.getByRole("radio", { name: asset, exact: true });
  if (await ticker.count()) await ticker.first().click();
  const bet = page.getByRole("button", { name: new RegExp(`^Bet ${side} · ${asset} ·`) }).first();
  await expect(bet).toBeVisible({ timeout: 120_000 });
  await bet.click();
  const ticket = page.getByRole("region", { name: "Your call", exact: true }).last();
  await expect(ticket).toBeVisible({ timeout: 20_000 });
  await ticket.getByLabel("Bet amount in dollars").fill("1");
  const cta = ticket.getByRole("button", { name: new RegExp(`^Buy ${side} for \\$`) });
  if (!(await expect(cta).toBeEnabled({ timeout: 75_000 }).then(() => true, () => false))) {
    console.log(JSON.stringify({ step: "no-liquidity", asset, side }));
    await closeTicket(page);
    return false;
  }
  await page.evaluate(() => performance.clearMarks());
  const before = assertions;
  const netFrom = net.length;
  await cta.click();
  const card = ticket.locator(".call-card");
  const failed = ticket.getByRole("status").filter({ hasText: /Nothing filled|book moved|Waiting for the chain/ }).or(ticket.getByRole("alert"));
  await expect(card.or(failed).first()).toBeVisible({ timeout: 90_000 });
  // Wait for the receipt too (the confirmed card, or the rollback).
  await expect(ticket.locator('.call-card:not([data-call-state="pending"])').or(failed).first()).toBeVisible({ timeout: 90_000 }).catch(() => undefined);
  await page.waitForTimeout(300);
  const marks = await marksOf(page);
  const ok = await ticket.locator(".call-card").isVisible();
  const tx = ok ? await ticket.getByRole("link", { name: /verify on the Tempo explorer/ }).getAttribute("href").catch(() => null) : null;
  const phases = phasesOf(marks, net.slice(netFrom));
  const row = { step: ok ? "call" : "not-placed", asset, side, prompts: assertions - before, tx, ...phases, text: ok ? undefined : (await failed.first().innerText().catch(() => "")).slice(0, 120) };
  results.push(row);
  console.log(JSON.stringify(row));
  if (ok) await ticket.getByRole("button", { name: "Place another" }).click().catch(() => undefined);
  await closeTicket(page);
  return ok;
}

let failedRun = false;
try {
  await page.goto(`${base}/markets`, { waitUntil: "load" });
  await settle(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.getByLabel(/Name this passkey/).fill(`tap latency ${Date.now()}`);
  await page.getByRole("button", { name: "Create my account" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/You're funded/)).toBeVisible({ timeout: 90_000 });
  const signUp = assertions;
  await dialog.getByRole("button", { name: "Arm tap-trading" }).click();
  await expect(dialog.getByText("Tap-trading is on.")).toBeVisible({ timeout: 30_000 });
  console.log(JSON.stringify({ step: "armed", signUpAssertions: signUp, armAssertions: assertions - signUp }));
  await dialog.getByRole("button", { name: "Go to Markets" }).click();
  await expect(dialog).toBeHidden();

  const plan: [string, "UP" | "DOWN"][] = [["BTC", "UP"], ["ETH", "DOWN"], ["SOL", "UP"], ["BTC", "DOWN"], ["ETH", "UP"], ["SOL", "DOWN"]];
  let placed = 0;
  for (let i = 0; placed < taps && i < taps * 3; i++) {
    const [asset, side] = plan[i % plan.length]!;
    const ok = await tap(asset, side).catch(async (e: Error) => {
      console.log(JSON.stringify({ step: "error", asset, side, why: e.message.split("\n").slice(0, 3).join(" | ") }));
      await page.screenshot({ path: join(out, `error-${i}.png`) }).catch(() => undefined);
      await closeTicket(page);
      return false;
    });
    if (ok) placed += 1;
  }
  const summary = summarize(results.filter((r) => r.step === "call") as never);
  console.log(JSON.stringify({ step: "summary", base, taps: placed, pushedLogs, ...summary }));
  results.push({ step: "summary", base, ...summary });
} catch (error) {
  failedRun = true;
  await page.screenshot({ path: join(out, "fail.png") }).catch(() => undefined);
  console.log(JSON.stringify({ step: "FAIL", message: (error as Error).message.split("\n").slice(0, 4).join(" | ") }));
}
writeFileSync(join(out, `tap-latency-${Date.now()}.json`), JSON.stringify({ base, results, net }, null, 2));
await browser.close();
if (failedRun) process.exit(1);
