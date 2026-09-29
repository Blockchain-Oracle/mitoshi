/**
 * The trust surface end to end (D-053, S1 settings step) on real Moderato: sign up with a Chrome virtual authenticator
 * (funded by the ceremony), authorise a real limited access key on that same passkey account from Node (the
 * authenticator's credential rebuilt headlessly — S4 will do this from the UI), then on /settings/account see the key
 * with its live limit, revoke it with the page's own passkey (our relay pays), and see it move to Stopped. Prints the
 * authorise and revoke tx hashes for `cast receipt`. 390 px, both themes' axe on the page.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/account-keys.ts --base http://localhost:3101 --out <dir>
 */
import { createPrivateKey } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, expect } from "@playwright/test";
import { authorizeTestKey } from "@cwf/markets/testing";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "http://localhost:3101");
const out = arg("out", "account-keys-out");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 900 }, hasTouch: true });
const page = await context.newPage();
const errors: string[] = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

let failed = false;
try {
  await page.goto(`${base}/settings/account`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page.getByRole("dialog").getByText(/You're funded/)).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Escape");

  // The passkey's own P-256 key, from the virtual authenticator, rebuilt as the same Tempo account in Node.
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  const der = Buffer.from(credentials[0]!.privateKey, "base64");
  const d = createPrivateKey({ key: der, format: "der", type: "pkcs8" }).export({ format: "jwk" }).d!;
  const rootKey = `0x${Buffer.from(d, "base64url").toString("hex")}` as `0x${string}`;
  const key = await authorizeTestKey({ rpcUrl: "https://rpc.moderato.tempo.xyz", rootP256PrivateKey: rootKey, webAuthn: { rpId: new URL(base).hostname, origin: base }, limitBase: 25_000_000n, periodSec: 86_400n, validForSec: 86_400 });
  console.log(JSON.stringify({ step: "authorized", ...key }));

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText(key.account, { exact: false })).toBeVisible({ timeout: 20_000 });
  const row = page.getByRole("listitem").filter({ hasText: "Trading key" });
  await expect(row).toContainText("$25.00 of $25.00 pathUSD left", { timeout: 60_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, "keys-active-390.png"), fullPage: true });
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  if (axe.violations.length) throw new Error(`axe: ${axe.violations.map((v) => `${v.id}(${v.nodes.length})`).join(", ")}`);

  await row.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText("No active keys. Nothing can sign for this account except you.")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("radio", { name: /Stopped/ }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Revoked" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Revoked" })).not.toContainText("Never expires");
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(out, "keys-stopped-390.png"), fullPage: true });

  type Report = { keys?: { keyId: string; revoked: { txHash: string } | null }[]; error?: string };
  let report: Report = {};
  for (let i = 0; i < 5 && !report.keys; i++) {
    report = (await (await fetch(`${base}/api/keys?account=${key.account}`)).json()) as Report;
    if (!report.keys) await page.waitForTimeout(2_000);
  }
  if (!report.keys) throw new Error(`keys read failed: ${report.error}`);
  const revokedTx = report.keys.find((k) => k.keyId.toLowerCase() === key.keyId.toLowerCase())?.revoked?.txHash;
  console.log(JSON.stringify({ step: "revoked", keyId: key.keyId, revokeTx: revokedTx }));
  if (!revokedTx) throw new Error("revocation not on chain");
  if (errors.length) throw new Error(`console errors: ${errors.slice(0, 3).join(" | ")}`);
} catch (error) {
  failed = true;
  console.log(`FAIL: ${(error as Error).message.split("\n")[0]}`);
  const details = page.getByText("Technical details");
  if (await details.isVisible().catch(() => false)) {
    await details.click();
    console.log(`failure details: ${(await page.locator("details").last().innerText()).slice(0, 800)}`);
  }
  await page.screenshot({ path: join(out, "fail.png"), fullPage: true }).catch(() => undefined);
}
await browser.close();
if (failed) process.exit(1);
