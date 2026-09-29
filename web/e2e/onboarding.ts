/**
 * The one-ceremony sign-up end to end (D-046, S1 gate) with a Chrome virtual authenticator (CDP WebAuthn): open the
 * app, Sign in → Create my account (one biometric) → the server faucet funds the new passkey account on Moderato with
 * no second prompt → the funded receipt → Go to Markets. Asserts the header balance is > $0 afterwards, that no
 * WebAuthn assertion was needed for funding, and prints the funding tx hashes for `cast receipt`. Also checks the
 * modal is centred at 390 px (never a bottom sheet), axe on the funded step, and 0 console errors.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/onboarding.ts --base http://localhost:3101 --out <dir>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, expect } from "@playwright/test";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "http://localhost:3101");
const out = arg("out", "onboarding-out");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const failures: string[] = [];
for (const width of [390, 1440]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768 });
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
    await page.goto(`${base}/markets`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.getByLabel(/Name this passkey/).fill(`e2e ${width}`);
    await page.getByRole("button", { name: "Create my account" }).click();
    await expect(dialog.getByText("Your account is ready")).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText(/You're funded/)).toBeVisible({ timeout: 60_000 });
    const box = (await dialog.boundingBox())!;
    const centred = Math.abs(box.x + box.width / 2 - width / 2) < 2 && box.y > 0;
    if (!centred) throw new Error(`modal not centred: x=${box.x} w=${box.width} y=${box.y}`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(out, `funded-${width}.png`) });
    const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa"]).analyze();
    if (axe.violations.length) throw new Error(`axe: ${axe.violations.map((v) => v.id).join(", ")}`);
    if (assertions !== 0) throw new Error(`funding needed ${assertions} extra passkey prompt(s)`);
    await dialog.getByRole("button", { name: "Go to Markets" }).click();
    await expect(dialog).toBeHidden();
    await page.waitForURL(/\/markets$/);
    const pill = page.getByRole("button", { name: /^Balance \$/ });
    await expect(pill).not.toHaveAccessibleName(/Balance \$0\.00|Balance —/, { timeout: 20_000 });
    // The first-use explainer for Windows shows once on /markets and stays dismissed across reloads.
    const hint = page.getByRole("complementary", { name: "How a Window works" });
    await expect(hint).toBeVisible();
    await hint.getByRole("button").click();
    await expect(hint).toBeHidden();
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("complementary", { name: "How a Window works" })).toBeHidden();
    // Add money from the header: the same account today is told about the cooldown up front and offered no button that would fail.
    await page.getByRole("button", { name: /^Balance \$/ }).click();
    const funds = page.getByRole("dialog");
    await expect(funds.getByText("This account already got test dollars today.")).toBeVisible({ timeout: 20_000 });
    await expect(funds.getByRole("button", { name: "Get test dollars" })).toBeDisabled();
    await page.screenshot({ path: join(out, `addfunds-cooldown-${width}.png`) });
    const axeFunds = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa"]).analyze();
    if (axeFunds.violations.length) throw new Error(`axe add money: ${axeFunds.violations.map((v) => v.id).join(", ")}`);
    await page.keyboard.press("Escape");
    const credentials = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
    console.log(JSON.stringify({ width, ok: true, credentials: credentials.credentials.length, extraPrompts: assertions, balance: await pill.getAttribute("aria-label"), faucetHashes }));
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
