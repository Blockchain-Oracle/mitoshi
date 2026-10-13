/**
 * The backup passkey end to end on the deployed build (S13 step 10, D-053), from a CI runner with Chrome's virtual
 * authenticators: sign up with a platform passkey (funded by the ceremony); add a backup on a second, USB
 * authenticator from /settings/account — the root signs `authorizeAdminKey` (TIP-1049) and pays its fee; then, in a
 * fresh browser that holds only the backup credential, "I already have one — sign in" signs in as the same account.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/s13-backup.ts --base https://mitoshi.xyz --out <dir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect, type BrowserContext, type Page } from "@playwright/test";
import { settle } from "./lib/settle";
import { openTerminal } from "./lib/terminal";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "https://mitoshi.xyz");
const out = arg("out", "s13-backup-out");
mkdirSync(out, { recursive: true });
const log = (o: Record<string, unknown>) => console.log(JSON.stringify(o));
const result: Record<string, unknown> = {};
const authOptions = (transport: "internal" | "usb") => ({ options: { protocol: "ctap2" as const, transport, hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

async function fresh(ctx: BrowserContext): Promise<{ page: Page; cdp: Awaited<ReturnType<BrowserContext["newCDPSession"]>> }> {
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && log({ console: m.text().slice(0, 200) }));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  return { page, cdp };
}
const accountOf = async (page: Page) => ((await (await page.request.get(`${base}/api/account/backup-passkey`)).json()) as { account?: string; backups?: unknown[] });

const browser = await chromium.launch();
try {
  // 1. Sign up with a platform passkey.
  const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  ctx1.setDefaultTimeout(90_000);
  const a = await fresh(ctx1);
  await a.cdp.send("WebAuthn.addVirtualAuthenticator", authOptions("internal"));
  await a.page.goto(`${base}/settings/account`, { waitUntil: "load" });
  await settle(a.page);
  await a.page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await a.page.getByRole("button", { name: "Create my account" }).click();
  await expect(a.page.getByRole("dialog").getByText(/You're funded/)).toBeVisible({ timeout: 90_000 });
  await a.page.keyboard.press("Escape");
  const before = await accountOf(a.page);
  result.account = before.account;
  log({ step: "signed up", account: before.account });

  // 1b. Control: an unsponsored root send (Withdraw $1) before any second authenticator exists — the same send path
  //     the backup's authorisation takes, so a failure here is the wallet stack's, not the backup's.
  await openTerminal(a.page, base, "BTC");
  // The equity pill opens the account drawer (as s5-pages does).
  await a.page.locator(".tm-equity:visible").first().click();
  await a.page.getByRole("dialog").getByRole("button", { name: "Withdraw" }).first().click();
  await a.page.getByPlaceholder("0x…").fill("0x000000000000000000000000000000000000dEaD");
  await a.page.getByPlaceholder("0.00").fill("1");
  await a.page.getByRole("button", { name: /^Send \$/ }).click();
  const sent = await Promise.race([
    a.page.getByText(/^Sent \$/).first().waitFor({ timeout: 90_000 }).then(() => "sent"),
    a.page.getByText("Didn't send").first().waitFor({ timeout: 90_000 }).then(async () => `didn't send: ${(await a.page.locator("[data-sonner-toast], [role=status], [role=alert]").allInnerTexts()).join(" | ").replace(/\s+/g, " ").slice(0, 200)}`),
  ]).catch(() => "no answer");
  result.withdraw = sent;
  log({ step: "withdraw $1 (unsponsored root send)", result: sent });
  await a.page.goto(`${base}/settings/account`, { waitUntil: "load" });
  await settle(a.page);

  // 2. Add the backup on a second (USB) authenticator; the page's own passkey signs and pays.
  const { authenticatorId: usb } = await a.cdp.send("WebAuthn.addVirtualAuthenticator", authOptions("usb"));
  await a.page.reload({ waitUntil: "load" });
  await settle(a.page);
  a.page.on("response", (r) => { if (r.url().includes("/api/account/backup-passkey") && r.request().method() === "POST") void r.text().then((t) => log({ backupPost: r.status(), body: t.slice(0, 200) })).catch(() => undefined); });
  a.page.on("response", (r) => { if (r.status() >= 400) void r.text().then((t) => log({ failedResponse: r.status(), url: r.url().slice(0, 100), body: t.slice(0, 300) })).catch(() => undefined); });
  await a.page.getByRole("button", { name: "Add a backup passkey" }).click();
  // Step 1 made the backup on the USB key; take its credential and unplug it, so only this passkey answers step 2.
  await a.page.getByRole("button", { name: "Confirm with this passkey" }).waitFor({ timeout: 60_000 });
  const { credentials } = await a.cdp.send("WebAuthn.getCredentials", { authenticatorId: usb });
  await a.cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: usb });
  await a.page.getByRole("button", { name: "Confirm with this passkey" }).click();
  const shown = await a.page.getByText("Mitoshi backup").first().waitFor({ state: "visible", timeout: 120_000 }).then(() => true, () => false);
  if (!shown) {
    await a.page.screenshot({ path: join(out, "backup-failed.png") });
    const texts = await a.page.locator("[role=status], [role=alert], [data-sonner-toast]").allInnerTexts();
    throw new Error(`no backup shown; page says: ${texts.map((t) => t.replace(/\s+/g, " ").slice(0, 140)).join(" | ")}`);
  }
  const after = await accountOf(a.page);
  result.backups = after.backups?.length ?? 0;
  await a.page.screenshot({ path: join(out, "backup-added.png") });
  log({ step: "backup added", backups: result.backups, credentials: credentials.length });

  // 3. A fresh browser with only the backup credential signs in as the same account.
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  ctx2.setDefaultTimeout(90_000);
  const b = await fresh(ctx2);
  const { authenticatorId: other } = await b.cdp.send("WebAuthn.addVirtualAuthenticator", authOptions("internal"));
  for (const c of credentials) await b.cdp.send("WebAuthn.addCredential", { authenticatorId: other, credential: c });
  await b.page.goto(`${base}/settings/account`, { waitUntil: "load" });
  await settle(b.page);
  await b.page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await b.page.getByRole("button", { name: /I already have one/ }).click();
  await expect(b.page.getByText(String(before.account), { exact: false }).first()).toBeVisible({ timeout: 60_000 }).catch(() => undefined);
  const recovered = await accountOf(b.page);
  result.recoveredAs = recovered.account;
  result.sameAccount = recovered.account === before.account;
  await b.page.screenshot({ path: join(out, "signed-in-with-backup.png") });
  log({ step: "signed in with the backup", account: recovered.account, same: result.sameAccount });
} catch (e) {
  result.error = String(e).slice(0, 400);
  for (const [i, ctx] of browser.contexts().entries()) for (const p of ctx.pages()) await p.screenshot({ path: join(out, `failure-${i}.png`) }).catch(() => undefined);
} finally {
  await browser.close();
}
writeFileSync(join(out, "s13-backup.json"), JSON.stringify(result, null, 2));
log({ step: "done", ...result });
process.exitCode = result.sameAccount === true && result.backups === 1 ? 0 : 1;
