/**
 * The per-user live channel for a signed-in user (D-151): a fresh passkey (Chrome virtual authenticator) signs up →
 * `/api/stream/ticket` answers 200 for its own `user:<address>` topic and the session cookie lives 30 days; the same
 * browser with its server session gone (expired, Redis lost, cookies cleared — the wagmi connection still restores) gets
 * 401 from the ticket route, and the page follows the wallet's own engine events on the chain instead: `eth_subscribe`
 * log filters over the RPC WebSocket carrying the wallet as an indexed topic. Then the existing passkey signs in
 * (login ceremony) and the ticket answers 200 again. Exits non-zero on any miss.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/stream-ticket.ts --base https://testnet.mitoshi.xyz
 */
import { chromium, expect, type Page } from "@playwright/test";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "http://localhost:3104");
const opts = { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } as const;
const THIRTY_DAYS = 30 * 24 * 60 * 60;

const browser = await chromium.launch();
const failures: string[] = [];
const check = (ok: boolean, what: string, detail: unknown = "") => {
  console.log(JSON.stringify({ check: what, ok, detail }));
  if (!ok) failures.push(what);
};
const ticket = (p: Page) => p.evaluate(`fetch("/api/stream/ticket", { method: "POST", credentials: "same-origin" }).then(async (r) => ({ status: r.status, body: r.ok ? await r.json() : null }))`) as Promise<{ status: number; body: { topic: string } | null }>;

const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: opts });
let setCookie = "";
page.on("response", async (r) => { if (/\/api\/auth\/(register|login)$/.test(new URL(r.url()).pathname)) setCookie = (await r.allHeaders())["set-cookie"] ?? ""; });
const subscribes: string[] = [];
page.on("websocket", (ws) => ws.on("framesent", (f) => { const t = String(f.payload); if (t.includes("eth_subscribe") && t.includes("\"logs\"")) subscribes.push(t.toLowerCase()); }));

try {
  await page.goto(`${base}/markets`, { waitUntil: "load" });
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.getByLabel(/Name this passkey/).fill(`ticket ${Date.now()}`);
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page.getByRole("dialog").getByText(/You're funded/)).toBeVisible({ timeout: 90_000 });
  const fresh = await ticket(page);
  check(fresh.status === 200 && /^user:0x[0-9a-f]{40}$/.test(fresh.body?.topic ?? ""), "ticket after sign-up", fresh.status);
  const maxAge = Number(/Max-Age=(\d+)/.exec(setCookie)?.[1] ?? 0);
  check(maxAge === THIRTY_DAYS, "session cookie lives 30 days", maxAge);
  const wallet = fresh.body!.topic.slice(5);
  const walletTopic = `0x${"0".repeat(24)}${wallet.slice(2)}`;

  // The server session is gone; the passkey connection still restores in the browser.
  await context.clearCookies({ name: "cwf_passkey" });
  subscribes.length = 0;
  await page.goto(`${base}/markets`, { waitUntil: "load" });
  await page.waitForTimeout(8_000);
  const gone = await ticket(page);
  check(gone.status === 401, "no session → 401", gone.status);
  check(await page.getByRole("button", { name: "Sign in", exact: true }).count() === 0, "still signed in on the page");
  const mine = subscribes.filter((s) => s.includes(walletTopic));
  check(mine.length >= 8, "the wallet's engine events followed on the chain (eth_subscribe logs with the wallet topic)", mine.length);

  // Signing in again with the same passkey (login ceremony) restores the ticket.
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const p2 = await ctx2.newPage();
  const cdp2 = await ctx2.newCDPSession(p2);
  await cdp2.send("WebAuthn.enable");
  const a2 = await cdp2.send("WebAuthn.addVirtualAuthenticator", { options: opts });
  for (const c of credentials) await cdp2.send("WebAuthn.addCredential", { authenticatorId: a2.authenticatorId, credential: c });
  await p2.goto(`${base}/markets`, { waitUntil: "load" });
  await p2.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await p2.getByRole("dialog").getByRole("button", { name: /already have one/ }).click();
  await expect(p2.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0, { timeout: 30_000 });
  const back = await ticket(p2);
  check(back.status === 200 && back.body?.topic === `user:${wallet}`, "ticket after login", back.status);
} catch (error) {
  failures.push((error as Error).message.split("\n")[0]!);
  console.log(JSON.stringify({ check: "run", ok: false, detail: (error as Error).message.split("\n").slice(0, 3).join(" | ") }));
}
await browser.close();
console.log(JSON.stringify({ base, failures }));
if (failures.length) process.exit(1);
