/**
 * The one-ceremony sign-up on the terminal (D-046, D-191; S1 gate re-run for S23) with a Chrome virtual authenticator,
 * at 390 and 1440: `/trade/BTC` → the five-step tour → "Start trading" → Create my account (one biometric) → the server
 * faucet funds the new passkey account on Moderato with no second prompt → the funded step. Asserts no passkey
 * assertion was needed for funding, the modal centred (never a bottom sheet), axe on the funded step, the equity pill
 * above $0, the tour staying dismissed across a reload, Add money from Account naming the faucet's cooldown with no
 * button that would fail, and 0 console errors. Prints the funding tx hashes for `cast receipt`.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/onboarding.ts --base https://testnet.mitoshi.xyz --out <dir>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, expect } from "@playwright/test";
import { settle } from "./lib/settle";
import { modal } from "./lib/terminal";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "https://testnet.mitoshi.xyz");
const out = arg("out", "onboarding-out");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const failures: string[] = [];
for (const width of [390, 1440]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768 });
  context.setDefaultTimeout(90_000);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  let assertions = 0;
  cdp.on("WebAuthn.credentialAsserted", () => { assertions += 1; });
  const faucetHashes: string[] = [];
  page.on("response", async (r) => {
    if (r.url().endsWith("/api/faucet") && r.request().method() === "POST") {
      const body = (await r.json().catch(() => null)) as { claim?: { txHashes: string[] } } | null;
      faucetHashes.push(...(body?.claim?.txHashes ?? []));
    }
  });

  try {
    await page.goto(`${base}/trade/BTC`, { waitUntil: "load" });
    await settle(page);
    const tour = modal(page);
    await expect(tour.getByText("Watch the market")).toBeVisible({ timeout: 120_000 });
    for (let i = 0; i < 4; i++) await tour.getByRole("button", { name: "Next" }).click();
    await tour.getByRole("button", { name: "Start trading" }).click();
    const dialog = modal(page);
    await page.getByLabel(/Name this passkey/).fill(`e2e ${width}`);
    await page.getByRole("button", { name: "Create my account" }).click();
    await expect(dialog.getByText("Your account is ready")).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByText(/You're funded/)).toBeVisible({ timeout: 120_000 });
    const box = (await dialog.boundingBox())!;
    const centred = Math.abs(box.x + box.width / 2 - width / 2) < 2 && box.y > 0;
    if (!centred) throw new Error(`modal not centred: x=${box.x} w=${box.width} y=${box.y}`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(out, `funded-${width}.png`) });
    const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa"]).analyze();
    if (axe.violations.length) throw new Error(`axe: ${axe.violations.map((v) => v.id).join(", ")}`);
    if (assertions !== 0) throw new Error(`funding needed ${assertions} extra passkey prompt(s)`);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // Equity on the pill (NumberFlow's own label carries the figure; its digits render in a shadow root).
    const figure = page.locator(".tm-equity:visible [role='img']").first();
    await expect(figure).toHaveAttribute("aria-label", /\$[1-9]/, { timeout: 30_000 });
    const equity = await figure.getAttribute("aria-label");

    // The tour shows on the first visit only: a reload goes straight to the terminal.
    await page.reload({ waitUntil: "load" });
    await settle(page);
    await page.waitForTimeout(2_000);
    if (await modal(page).getByText("Watch the market").isVisible().catch(() => false)) throw new Error("the tour came back after a reload");

    // Add money from Account: the same account today is told about the cooldown up front, with no button that would fail.
    await page.locator(".tm-equity:visible").first().click();
    await modal(page).getByRole("button", { name: "Add money" }).click();
    const funds = modal(page).filter({ hasText: "test dollars" }).last();
    await expect(funds.getByText("This account already got test dollars today.")).toBeVisible({ timeout: 30_000 });
    await expect(funds.getByRole("button", { name: "Get test dollars" })).toBeDisabled();
    await page.screenshot({ path: join(out, `addfunds-cooldown-${width}.png`) });
    const axeFunds = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa"]).analyze();
    if (axeFunds.violations.length) throw new Error(`axe add money: ${axeFunds.violations.map((v) => v.id).join(", ")}`);
    await page.keyboard.press("Escape");

    const credentials = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
    console.log(JSON.stringify({ width, ok: true, credentials: credentials.credentials.length, extraPrompts: assertions, equity, faucetHashes }));
    if (errors.length) throw new Error(`console errors: ${errors.slice(0, 3).join(" | ")}`);
  } catch (error) {
    failures.push(`${width}: ${(error as Error).message.split("\n")[0]}`);
    await page.screenshot({ path: join(out, `fail-${width}.png`) }).catch(() => undefined);
    console.log(`FAIL ${width}: ${(error as Error).message.split("\n")[0]}`);
  }
  await context.close();
}
await browser.close();
if (failures.length) process.exit(1);
