// Ported from Owarine 90a91d71:web/src/features/x/copy.ts — S11 (D-227): Mitoshi's words at Owarine's length or less
// (the owner's terse-copy rule): a title, a number, one button. Every X error a person can meet is said here in words.
import type { XReadBlock } from "@cwf/core";
import type { XReason } from "./protocol";

/** The server's refusals (`/api/x/bind`, `/api/x/unlink`): read out as they are. */
export const X_REFUSE = {
  notConfigured: "X sign-in isn't switched on here yet.",
  storeUnavailable: "X links can't be saved right now. Try again shortly.",
  signInFirst: "Sign in with X first.",
  badRequest: "That request was malformed. Try again.",
  staleSignature: "That signature expired. Sign again.",
  signatureMismatch: "That signature isn't from this account.",
  linkedElsewhere: "This X account is linked to another Mitoshi account.",
  notLinked: "This X account isn't linked to this account.",
  linkFailed: "Couldn't link. Try again.",
  unlinkFailed: "Couldn't unlink. Try again.",
} as const;

/** Why the X sign-in bounced (`?x=err&x_reason=`), in words. */
const OAUTH: Record<string, string> = {
  denied: "X sign-in was cancelled.",
  state: "That X sign-in expired. Try again.",
  token: "X couldn't finish the sign-in. Try again.",
  profile: "X signed you in but didn't share your profile. Try again.",
  credits: "X refused the profile read (the X app has no API credits).",
  config: "X sign-in isn't switched on here yet.",
  server: "X is unreachable right now. Try again.",
  region: "X trading isn't available in your region.",
};

export function xOAuthMessage(reason: string | null): string {
  if (reason?.startsWith("token_")) return reason === "token_invalid_grant" ? "That X approval expired. Try again." : `X refused the sign-in (${reason.slice(6).replaceAll("_", " ")}).`;
  return OAUTH[(reason ?? "") as XReason] ?? "X sign-in didn't finish. Try again.";
}

/** The relay's read state, in a line. */
export const RELAY_LINE: Record<XReadBlock | "ok" | "stopped" | "stale", string> = {
  ok: "Reading mentions",
  stopped: "X trading isn't running yet",
  stale: "X trading status is out of date",
  credits: "Paused: X wants API credits",
  session: "Paused: the bot's X session needs renewing",
  "rate-limited": "Paused by X's rate limit",
  unconfigured: "X trading isn't set up yet",
  error: "Paused: X is unreachable",
};

export const TFX = {
  title: "Trade from X",
  lede: (handle: string) => `Post a call at @${handle}. It trades your X balance.`,
  steps: { x: "Sign in with X", link: "Link your account", fund: "Fund X trading" },
  signIn: "Sign in with X",
  signedInAs: (h: string) => `@${h}`,
  linkAs: (h: string) => `Link @${h}`,
  linkIntent: (h: string) => `to link @${h}`,
  linking: "Linking…",
  linked: (h: string) => `@${h} trades from this account`,
  otherAccount: (a: string) => `Linked to ${a}. Sign in with it, or link here instead.`,
  relink: (h: string) => `Link @${h} here instead`,
  fundCta: (usd: string) => `Enable X trading · ${usd}`,
  fundIntent: (usd: string) => `to fund X trading · ${usd}`,
  addCta: (usd: string) => `Add ${usd}`,
  balance: "X balance",
  cashOut: "Cash out",
  renew: "Renew X trading",
  can: "Opens positions you own. Can't withdraw.",
  terms: "8 open Windows · 30 days · stop anytime",
  noExecutor: "X trading isn't running yet. Funding opens when it is.",
  funded: (usd: string) => `X trading on · ${usd}`,
  cashedOut: (usd: string) => `${usd} back in your Trading Balance`,
  unlink: "Unlink X",
  unlinked: "X unlinked. Your funds stay.",
  builder: { title: "Make your call", copy: "Copy", copied: "Copied", post: "Post on X", setup: "Finish the steps above first.", closed: "No open Window for that right now." },
  receipts: { title: "Receipts", empty: "No mentions yet.", signIn: "Sign in with X to see yours." },
  testnet: "Testnet · test dollars",
  waitsOn: "X sign-in isn't switched on here yet.",
  unreadable: "Couldn't read your X link. Retrying.",
} as const;

export const CLAIM = {
  title: "Claim from X",
  ask: "Your X calls, your balance.",
  waiting: (usd: string) => `${usd} waiting`,
  steps: { prove: "Prove it's you", where: "Open your account" },
  routesTo: (a: string) => `Your X routes to ${a}.`,
  noRoute: "Nothing routes to this X account yet.",
  thisOne: "This is the account. It's all in Portfolio.",
  signInAs: (a: string) => `Sign in as ${a}`,
  openPortfolio: "Open Portfolio",
  setUp: "Set up Trade from X",
  card: { brand: "mitoshi", claimed: "CLAIMED", waiting: "WAITING", balance: "TRADING BALANCE", x: "X BALANCE", hidden: "• •", reveal: "Sign in with X to see it", only: "Only you can cash out.", network: "Tempo testnet" },
} as const;

export const XCARD = {
  title: "X",
  none: "Not linked",
  manage: "Trade from X",
} as const;

export const NATIVE = {
  title: "Back to the app",
  continue: "Continue in the app",
  why: "Open this from the Mitoshi app to sign in with X there.",
  web: "Sign in on the web",
  finishing: "Finishing sign-in…",
  failed: "That sign-in expired. Start again in the app.",
} as const;

export const GO = {
  title: "Opening the call",
  unknown: "That link doesn't name a listed call.",
  markets: "Go to Markets",
} as const;
