/**
 * What every terminal driver shares (S23 gate): a Chromium page with a virtual passkey (CTAP2, user-verified) whose
 * assertions are counted, a toast recorder installed before the page's scripts (a toast can expire before a step logs),
 * every transaction hash the app sends, the first visit's tour ending in the real sign-up (D-191), the $1 stake, and
 * the wait for a Window that takes entries (a 5m Window spends its first 30–60 s on the opening print, and its last 30 s
 * closed to entries).
 */
import { chromium, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { settle } from "./settle";

/** A modal or drawer on screen — not a toast (Base UI renders every toast with `role="dialog"`). */
export const modal = (page: Page) => page.getByRole("dialog").filter({ hasNot: page.locator('[data-slot="toast-title"]') });

export interface TerminalSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  /** Passkey assertions so far (a prompt each on a real device). */
  assertions: () => number;
  txs: string[];
  /** Every toast title that appeared, in order. */
  toastsSeen: () => Promise<string[]>;
  log: (o: Record<string, unknown>) => void;
}

export async function openTerminalSession(opts: { width?: number } = {}): Promise<TerminalSession> {
  const width = opts.width ?? 1440;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, hasTouch: width < 768 });
  context.setDefaultTimeout(90_000);
  const page = await context.newPage();
  await page.addInitScript(() => {
    const w = window as unknown as { __toasts: string[] };
    w.__toasts = [];
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes) {
          const el = n instanceof Element ? (n.matches('[data-slot="toast-title"]') ? [n] : [...n.querySelectorAll('[data-slot="toast-title"]')]) : [];
          for (const t of el) if (t.textContent && w.__toasts.at(-1) !== t.textContent) w.__toasts.push(t.textContent);
        }
    }).observe(document, { childList: true, subtree: true });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  let assertions = 0;
  cdp.on("WebAuthn.credentialAsserted", () => {
    assertions += 1;
  });
  const log = (o: Record<string, unknown>) => console.log(JSON.stringify(o));
  const txs: string[] = [];
  page.on("response", async (r) => {
    if (r.request().method() !== "POST") return;
    if (!(r.request().postData() ?? "").includes("eth_sendRawTransaction")) return;
    const text = await r.text().catch(() => "");
    const m = /"transactionHash"\s*:\s*"(0x[0-9a-f]{64})"/.exec(text) ?? /"result"\s*:\s*"(0x[0-9a-f]{64})"/.exec(text);
    if (m) {
      txs.push(m[1]!);
      log({ step: "tx", hash: m[1] });
    }
  });
  return { browser, context, page, assertions: () => assertions, txs, toastsSeen: () => page.evaluate(() => (window as unknown as { __toasts?: string[] }).__toasts ?? []), log };
}

/** The first visit's five-step tour, then "Start trading": a fresh passkey, the faucet, one-tap armed (D-191). */
export async function signUpFromTour(s: TerminalSession, base: string, symbol: string, name: string): Promise<void> {
  const { page } = s;
  await page.goto(`${base}/trade/${symbol}`, { waitUntil: "load" });
  await settle(page);
  const tour = modal(page);
  await expect(tour.getByText("Watch the market")).toBeVisible({ timeout: 120_000 });
  for (let i = 0; i < 4; i++) await tour.getByRole("button", { name: "Next" }).click();
  await tour.getByRole("button", { name: "Start trading" }).click();
  await page.getByLabel(/Name this passkey/).fill(`${name} ${Date.now()}`);
  await page.getByRole("button", { name: "Create my account" }).click();
  const dialog = modal(page);
  await expect(dialog.getByText(/You're funded/)).toBeVisible({ timeout: 120_000 });
  const beforeArm = s.assertions();
  await dialog.getByRole("button", { name: "Arm tap-trading" }).click();
  await expect(dialog.getByText("Tap-trading is on.")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  s.log({ step: "signed-up", signUpPrompts: beforeArm, armPrompts: s.assertions() - beforeArm, toasts: await s.toastsSeen() });
}

/** The stake at its minimum ($1), so a run spends little of the faucet's balance. */
export async function stakeMin(page: Page): Promise<void> {
  await page.locator(".tm-stack").click();
  await modal(page).getByRole("button", { name: "Min" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".tm-stack-value").first()).toContainText("$1.00");
}

/**
 * Waits until `side` takes a tap: its button says what it pays (or, in a mode, its own sub-line) and no note blocks
 * it. Logs the Window's state every 10 s; throws after `maxMs`.
 */
export async function waitEnterable(s: TerminalSession, side: "up" | "down" = "up", maxMs = 420_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    const state = await s.page.evaluate((sd) => ({
      chip: document.querySelector(".tm-window-state")?.textContent ?? null,
      note: document.querySelector(`#tm-note-${sd}`)?.textContent ?? null,
      sub: document.querySelector(`#tm-note-${sd}`)?.previousElementSibling?.querySelector(".tm-btn-sub")?.textContent ?? null,
      flat: document.querySelector(".tm-buttons .tm-btn")?.textContent?.includes(sd.toUpperCase()) ?? false,
    }), side);
    if (state.flat && state.note === "" && state.sub) return;
    s.log({ step: "waiting", s: Math.round((Date.now() - start) / 1000), ...state });
    if (Date.now() - start > maxMs) throw new Error(`${side.toUpperCase()} never opened for entry: ${JSON.stringify(state)}`);
    await s.page.waitForTimeout(10_000);
  }
}

/** Switches the terminal to `symbol` in place, through the markets drawer (no navigation). */
export async function switchSymbol(page: Page, symbol: string): Promise<void> {
  if (new URL(page.url()).pathname === `/trade/${symbol}`) return;
  await page.locator(".tm-asset").first().click();
  const dialog = modal(page);
  await dialog.getByRole("button", { name: new RegExp(`^${symbol} ·`) }).click();
  await page.waitForURL(new RegExp(`/trade/${symbol}(\\?|$)`));
  await expect(dialog).toBeHidden();
}

/** Opens the terminal on `symbol` for an account that signed up elsewhere: the first visit's tour is skipped. */
export async function openTerminal(page: Page, base: string, symbol: string): Promise<void> {
  await page.goto(`${base}/trade/${symbol}`, { waitUntil: "load" });
  await settle(page);
  // The tour opens after the splash (1–4 s): wait for it rather than look once.
  const tour = modal(page).filter({ hasText: "Watch the market" });
  if (await tour.waitFor({ state: "visible", timeout: 12_000 }).then(() => true, () => false)) {
    await tour.getByRole("button", { name: "Skip" }).click();
    await expect(page.locator(".modal-root")).toHaveCount(0, { timeout: 10_000 });
  }
}
