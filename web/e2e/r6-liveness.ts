/**
 * R6 liveness, the browser half (D-230 items 1–3; `scripts/drive/r6-liveness.ts` runs it and checks the chain). A fresh
 * passkey account signs up from the tour on a phone-width terminal, sets a $5 stake, and on BTC's 5-minute lane waits
 * for the next Window's start: from T − 5 s it reads the Window chip and the line above UP/DOWN every second until UP
 * takes a call — the chip must count the Window's own clock ("trades m:ss" to T + 270 s, never "pricing…") and the
 * line must say when it opened, never a bare "Waiting". Then UP, once; then the same on SOL's 5-minute Window. Each
 * tap's press → "opened" toast time and the app's own marks are printed; every transaction hash the app sends is
 * printed for the chain check. One JSON object a line; the last is `{ step: "done", ok }`.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/r6-liveness.ts --base https://mitoshi.xyz --out <dir> [--watch-only]
 *
 * `--watch-only`: signed out (DEMO, paper) — the countdown watch and a paper tap on BTC, no account made.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { modal, openTerminalSession, signUpFromTour, switchSymbol, tapPhases, type TerminalSession } from "./lib/terminal";

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const base = arg("base", "https://mitoshi.xyz");
const out = arg("out", "r6-liveness-out");
const STAKE = "5";
const watchOnly = process.argv.includes("--watch-only");
const CADENCE_SEC = 300;
const ENTRY_BUFFER_SEC = 30;
mkdirSync(out, { recursive: true });

/** "trades 4:31" / "trades 42s" → seconds; null for anything else. */
function chipSeconds(chip: string | null): number | null {
  const m = /trades (?:(\d+):(\d{2})|(\d+)s)/.exec(chip ?? "");
  if (!m) return null;
  return m[3] !== undefined ? Number(m[3]) : Number(m[1]) * 60 + Number(m[2]);
}

async function setStake(page: Page, dollars: string): Promise<void> {
  await page.locator(".tm-stack").click();
  const size = modal(page).locator("#tm-size");
  await size.fill(dollars);
  await size.blur();
  await page.keyboard.press("Escape");
  await expect(page.locator(".tm-stack-value").first()).toContainText(`$${dollars}.00`);
}

/** The terminal's UP right now: its sub-line, whether it reads blocked, and the shared line above the pair. */
const UP_STATE = `(() => {
  const up = [...document.querySelectorAll(".tm-buttons .tm-btn")].find((b) => b.textContent.includes("UP"));
  return {
    chip: document.querySelector(".tm-window-state")?.textContent ?? null,
    why: document.querySelector(".tm-why")?.textContent ?? null,
    sub: up?.querySelector(".tm-btn-sub")?.textContent ?? null,
    blocked: !up || up.hasAttribute("aria-disabled") || up.disabled,
  };
})()`;
type UpState = { chip: string | null; why: string | null; sub: string | null; blocked: boolean };
const enterable = (st: UpState) => Boolean(st.sub?.includes("pays")) && !st.blocked && !st.why;

/**
 * From T − 5 s until UP takes a call: the chip and the line each second. The chip's countdown is compared with the
 * Window's entry cutoff (T + 270 s) on the device clock (the app's is chain-corrected; they agree within ~2 s).
 */
async function watchOpen(s: TerminalSession, symbol: string): Promise<Record<string, unknown>> {
  const { page, log } = s;
  const nowSec = () => Math.floor(Date.now() / 1000);
  const T = nowSec() - (nowSec() % CADENCE_SEC) + CADENCE_SEC;
  // A Window whose start is under 40 s away is taken as is; else wait for the next boundary's last 5 s.
  if (T - nowSec() > 5) await page.waitForTimeout((T - nowSec() - 5) * 1000);
  const samples: { t: number; chip: string | null; why: string | null; sub: string | null }[] = [];
  let bad: string[] = [];
  let enterableAt: number | null = null;
  for (let i = 0; i < 180; i++) {
    const st = (await page.evaluate(UP_STATE)) as UpState;
    const t = nowSec() - T;
    samples.push({ t, chip: st.chip, why: st.why, sub: st.sub });
    if (t >= 0) {
      if (st.chip?.includes("pricing")) bad.push(`T+${t}: chip "${st.chip}"`);
      const left = chipSeconds(st.chip);
      if (left !== null && Math.abs(left - (CADENCE_SEC - ENTRY_BUFFER_SEC - t)) > 3) bad.push(`T+${t}: chip ${left}s left, expected ${CADENCE_SEC - ENTRY_BUFFER_SEC - t}s`);
      if (st.why && /^Waiting for the opening print$/.test(st.why.trim())) bad.push(`T+${t}: bare "${st.why}"`);
      if (st.why && /opening price|RedStone|Tempo/.test(st.why) && !/^Opened \d\d:\d\d:\d\d · /.test(st.why.trim())) bad.push(`T+${t}: line without the open time: "${st.why}"`);
      if (enterable(st)) {
        enterableAt = t;
        break;
      }
    }
    await page.waitForTimeout(1_000);
  }
  bad = bad.slice(0, 12);
  const lines = [...new Set(samples.map((x) => x.why).filter(Boolean))];
  const r = { step: "open-watch", symbol, boundary: new Date(T * 1000).toISOString(), enterableAfterSec: enterableAt, lines, chips: samples.filter((_, k) => k % 5 === 0).map((x) => `${x.t}:${x.chip}`), countdownRight: bad.length === 0, problems: bad };
  log(r);
  await page.screenshot({ path: join(out, `${symbol}-open.png`) });
  return r;
}

/** UP, once (a requote taken once, as a person would), timed press → "opened" toast; the app's own marks after. */
async function tapUp(s: TerminalSession, symbol: string): Promise<boolean> {
  const { page, log } = s;
  const toasts = () => page.locator('[data-slot="toast-title"]').allInnerTexts();
  const up = page.locator(".tm-btn").filter({ hasText: "UP" }).first();
  // Up to two Windows: a book that is dry in this one's last stretch is quoted in the next.
  for (let i = 0; !enterable((await page.evaluate(UP_STATE)) as UpState); i++) {
    if (i > 600) throw new Error(`UP never took a call: ${JSON.stringify(await page.evaluate(UP_STATE))}`);
    await page.waitForTimeout(1_000);
  }
  const outcome = new RegExp(`Up ${symbol} opened|Price moved|Nothing filled|failed|Waiting for the chain|No price yet`);
  const t0 = Date.now();
  await up.click();
  await expect.poll(toasts, { timeout: 90_000 }).toContainEqual(expect.stringMatching(outcome));
  if ((await toasts()).includes("Price moved")) {
    await page.locator('[data-slot="toast-close"]').first().click().catch(() => undefined);
    await up.click();
    await expect.poll(toasts, { timeout: 90_000 }).toContainEqual(expect.stringMatching(outcome));
  }
  const opened = (await toasts()).some((t) => t.includes(`Up ${symbol} opened`));
  log({ step: "tap", symbol, opened, pressToToastMs: Date.now() - t0, phases: await tapPhases(page), toasts: await s.toastsSeen() });
  await page.screenshot({ path: join(out, `${symbol}-opened.png`) });
  return opened;
}

const session = await openTerminalSession({ width: 390 });
let ok = true;
try {
  if (watchOnly) {
    await session.page.goto(`${base}/trade/BTC`, { waitUntil: "load" });
    const tour = modal(session.page).filter({ hasText: "Watch the market" });
    if (await tour.waitFor({ state: "visible", timeout: 12_000 }).then(() => true, () => false)) await tour.getByRole("button", { name: "Skip" }).click();
  } else {
    await signUpFromTour(session, base, "BTC", "r6-liveness");
    await setStake(session.page, STAKE);
  }
  session.log({ step: "stake", stake: await session.page.locator(".tm-stack-value").first().innerText() });
  for (const symbol of watchOnly ? ["BTC"] : ["BTC", "SOL"]) {
    if (symbol !== "BTC") await switchSymbol(session.page, symbol);
    const watch = await watchOpen(session, symbol);
    if (!watch.countdownRight) ok = false;
    if (!(await tapUp(session, symbol))) ok = false;
  }
} catch (error) {
  ok = false;
  session.log({ step: "error", message: error instanceof Error ? error.message.split("\n")[0] : String(error) });
  await session.page.screenshot({ path: join(out, "error.png") }).catch(() => undefined);
} finally {
  session.log({ step: "done", ok, txs: session.txs });
  await session.browser.close();
}
process.exit(ok ? 0 : 1);
