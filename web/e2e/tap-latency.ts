/**
 * Tap latency on the terminal, open and close (plan §2.4 "≤ 1 s p50"; D-143, D-150; S23 gate). A fresh passkey signs up
 * from the tour (D-191) and arms one-tap, then runs `--taps` cycles on BTC, ETH and SOL 5m at $1: UP or DOWN, then
 * CLOSE on the position it opened, both with zero prompts. For the open, the app's own marks (`cwf:tap:*` from
 * `usePlaceBet`) and the network timings split the time as before:
 *
 *   press → handler   pointerdown on UP/DOWN → `cwf:tap:start`
 *   pre-send          → `cwf:tap:sent` (status gate, fresh quote, account reads)
 *   fill / sign / co-sign / send → receipt   the relay's and the RPC's own calls
 *   → card            pointerdown → the position's row on the terminal (`.tm-pos`)
 *   → confirmed       pointerdown → the "… opened" toast (the receipt read)
 *
 * and for the close: pointerdown on CLOSE → "Closing …" (the lane's `onSigned`, D-150) → "Closed …" (the receipt), with
 * the relay and RPC calls in between. Every tx hash is printed for `cast receipt`.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/tap-latency.ts --base https://testnet.mitoshi.xyz --taps 6 --out <dir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, type Request } from "@playwright/test";
import { openTerminalSession, signUpFromTour, stakeMin, switchSymbol, waitEnterable } from "./lib/terminal";
import { phasesOf, summarize, type NetCall, type TapMarks } from "./lib/tap-phases";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "https://testnet.mitoshi.xyz");
const out = arg("out", "tap-latency-out");
const taps = Number(arg("taps", "6"));
const width = Number(arg("width", "1440"));
mkdirSync(out, { recursive: true });

const s = await openTerminalSession({ width });
const { page, log } = s;
// Page-side marks on the app's clock: the presses, the position row, and each toast's first appearance.
await page.addInitScript(`(() => {
  const mark = (n) => { try { performance.mark(n); } catch {} };
  document.addEventListener("pointerdown", (e) => {
    const b = e.target && e.target.closest ? e.target.closest(".tm-buttons .tm-btn") : null;
    const t = b ? (b.textContent || "").trim() : "";
    if (/^(UP|DOWN)/.test(t)) mark("e2e:press");
    else if (/^CLOSE/.test(t)) mark("e2e:close-press");
  }, true);
  const seen = new Set();
  // What was on screen at the cycle's reset never marks this cycle: a toast whose text hasn't changed since (the
  // terminal replaces a toast in place by id, so the same element can carry this cycle's result), and the rows whose
  // titles were already listed.
  let staleText = new WeakMap();
  let titlesAtReset = new Set();
  new MutationObserver(() => {
    if (!seen.has("card") && [...document.querySelectorAll(".tm-side-list .tm-pos .tm-pos-title")].some((t) => !titlesAtReset.has(t.textContent))) { seen.add("card"); mark("e2e:card"); }
    for (const el of document.querySelectorAll('[data-slot="toast-title"]')) {
      if (staleText.get(el) === el.textContent) continue;
      const t = el.textContent || "";
      const key = / opened$/.test(t) ? "confirmed" : /^Closing /.test(t) ? "closing" : /^Closed /.test(t) ? "closed" : null;
      if (key && !seen.has(key)) { seen.add(key); mark("e2e:" + key); }
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
  window.__resetMarks = () => {
    seen.clear();
    performance.clearMarks();
    staleText = new WeakMap([...document.querySelectorAll('[data-slot="toast-title"]')].map((el) => [el, el.textContent]));
    titlesAtReset = new Set([...document.querySelectorAll(".tm-side-list .tm-pos .tm-pos-title")].map((t) => t.textContent));
  };
})()`);

const net: NetCall[] = [];
function rpcMethod(r: Request): string {
  try {
    const body = JSON.parse(r.postData() ?? "null") as { method?: string } | { method?: string }[] | null;
    return (Array.isArray(body) ? body.map((b) => b.method).join("+") : body?.method) ?? r.method();
  } catch { return r.method(); }
}
page.on("requestfinished", (r) => {
  const t = r.timing();
  if (t.startTime <= 0) return;
  const u = new URL(r.url());
  const where = u.pathname.startsWith("/api/relay") ? "relay" : /rpc/.test(u.host) ? "rpc" : `${u.host}${u.pathname}`.slice(0, 60);
  net.push({ where, method: r.method() === "POST" ? rpcMethod(r) : `GET ${u.pathname.slice(0, 40)}`, startMs: t.startTime, endMs: t.startTime + Math.max(t.responseEnd, 0) });
});

const at = (p: Page, names: string[]) =>
  p.evaluate((ns) => Object.fromEntries(ns.map((n) => { const m = performance.getEntriesByName(n).at(-1); return [n, m ? performance.timeOrigin + m.startTime : null]; })), names) as Promise<Record<string, number | null>>;

const opens: Record<string, unknown>[] = [];
const closes: { closeMs: number; closingMs: number | null; calls: string[] }[] = [];
async function cycle(asset: string, side: "up" | "down"): Promise<boolean> {
  await switchSymbol(page, asset);
  await waitEnterable(s, side, 300_000);
  await page.evaluate(() => (window as unknown as { __resetMarks: () => void }).__resetMarks());
  const before = s.assertions();
  const netFrom = net.length;
  await page.locator(".tm-buttons .tm-btn").filter({ hasText: side.toUpperCase() }).first().click();
  // This cycle's own marks, not whatever toast or row the last cycle left on screen.
  const refused = page.locator('[data-slot="toast-title"]').filter({ hasText: /Price moved|Nothing filled|Order failed|didn't go through|Waiting for the chain/ });
  const mark = async (n: string) => (await at(page, [n]))[n] ?? null;
  await expect.poll(async () => (await mark("e2e:confirmed")) !== null || (await refused.count()) > 0, { timeout: 90_000 }).toBe(true);
  if ((await mark("e2e:confirmed")) === null) {
    log({ step: "not-opened", asset, side, toast: await refused.first().innerText().catch(() => "") });
    return false;
  }
  await expect.poll(() => mark("e2e:card"), { timeout: 60_000 }).not.toBeNull();
  const m = await at(page, ["e2e:press", "cwf:tap:start", "cwf:tap:sent", "cwf:tap:signed", "cwf:tap:done", "e2e:card", "e2e:confirmed"]);
  const marks: TapMarks = { press: m["e2e:press"] ?? null, start: m["cwf:tap:start"] ?? null, sent: m["cwf:tap:sent"] ?? null, signed: m["cwf:tap:signed"] ?? null, done: m["cwf:tap:done"] ?? null, card: m["e2e:card"] ?? null, confirmed: m["e2e:confirmed"] ?? null };
  const row = { step: "open", asset, side, prompts: s.assertions() - before, ...phasesOf(marks, net.slice(netFrom)) };
  opens.push(row);
  log(row);

  // CLOSE on the position just opened (the buttons morph to TRAIL / CLOSE on its Window).
  const close = page.locator(".tm-buttons .tm-btn").filter({ hasText: "CLOSE" });
  await expect(close).toBeVisible({ timeout: 30_000 });
  const closeFrom = net.length;
  const closeBefore = s.assertions();
  await close.click();
  const notClosed = page.locator('[data-slot="toast-title"]').filter({ hasText: /^Price moved|No bids|Close failed|Close didn't go through|Nothing sold/ });
  await expect.poll(async () => (await mark("e2e:closed")) !== null || (await notClosed.count()) > 0, { timeout: 90_000 }).toBe(true);
  const c = await at(page, ["e2e:close-press", "e2e:closing", "e2e:closed"]);
  if (!c["e2e:close-press"] || !c["e2e:closed"]) {
    log({ step: "not-closed", asset, side, toast: await notClosed.first().innerText().catch(() => "") });
    return true;
  }
  const calls = net.slice(closeFrom).filter((x) => x.where === "relay" || x.where === "rpc").map((x) => `${x.where}:${x.method}:${Math.round(x.endMs - x.startMs)}ms`);
  const closeRow = { closeMs: Math.round(c["e2e:closed"]! - c["e2e:close-press"]!), closingMs: c["e2e:closing"] ? Math.round(c["e2e:closing"]! - c["e2e:close-press"]!) : null, calls };
  closes.push(closeRow);
  log({ step: "close", asset, side, prompts: s.assertions() - closeBefore, ...closeRow });
  await expect(page.locator(".tm-buttons .tm-btn").filter({ hasText: side.toUpperCase() }).first()).toBeVisible({ timeout: 60_000 }).catch(() => undefined);
  return true;
}

const pct = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]! : null);
let failed = false;
try {
  await signUpFromTour(s, base, "BTC", "tap latency");
  await stakeMin(page);
  const plan: [string, "up" | "down"][] = [["BTC", "up"], ["ETH", "down"], ["SOL", "up"], ["BTC", "down"], ["ETH", "up"], ["SOL", "down"]];
  let done = 0;
  for (let i = 0; done < taps && i < taps * 3; i++) {
    const [asset, side] = plan[i % plan.length]!;
    const ok = await cycle(asset, side).catch(async (e: Error) => {
      log({ step: "error", asset, side, why: e.message.split("\n").slice(0, 3).join(" | ") });
      await page.screenshot({ path: join(out, `error-${i}.png`) }).catch(() => undefined);
      return false;
    });
    if (ok) done += 1;
  }
  const closeMs = closes.map((c) => c.closeMs);
  const closingMs = closes.flatMap((c) => (c.closingMs === null ? [] : [c.closingMs]));
  log({ step: "summary", base, opens: opens.length, closes: closes.length, open: summarize(opens as never), close: { p50: pct(closeMs, 0.5), p90: pct(closeMs, 0.9), closingP50: pct(closingMs, 0.5) } });
} catch (error) {
  failed = true;
  await page.screenshot({ path: join(out, "fail.png") }).catch(() => undefined);
  log({ step: "FAIL", message: (error as Error).message.split("\n").slice(0, 4).join(" | ") });
}
writeFileSync(join(out, `tap-latency-${Date.now()}.json`), JSON.stringify({ base, opens, closes, txs: s.txs, net }, null, 2));
await s.browser.close();
process.exitCode = failed ? 1 : 0;
