// Ported from Masayume 68f7a09:packages/core/src/x/parse.ts and Owarine 90a91d71:packages/core/src/x/parse.ts (the
// registry's tickers and company words). S11 (D-227, A-3d): Mitoshi's universe — BTC, ETH, SOL and the listed stocks,
// stock cashtags (`$TSLA`) told apart from a `$5` stake — on the venue's three cadences.
import { TICKER_SYMBOLS, TICKERS, type TickerSymbol } from "../market/tickers";
import type { Side } from "../types/market";
import { oneUnit } from "../units/decimals";

/** The cadences every listed Series runs (5m, 15m, 1h on Moderato); the live venue decides which Windows trade now. */
export const X_CADENCES = { "5m": 300, "15m": 900, "1h": 3_600 } as const;
export type XCadence = keyof typeof X_CADENCES;

export type XAsset = TickerSymbol;
/** The company words people type (Owarine's list, Mitoshi's names). */
const NAME_WORDS: Record<string, XAsset> = {
  tesla: "TSLA", nvidia: "NVDA", apple: "AAPL", microsoft: "MSFT", meta: "META", google: "GOOGL", alphabet: "GOOGL", amazon: "AMZN",
  palantir: "PLTR", spacex: "SPCX", bitcoin: "BTC", ethereum: "ETH", ether: "ETH", solana: "SOL",
};
const ASSETS: Record<string, XAsset> = { ...Object.fromEntries(TICKER_SYMBOLS.map((s) => [s.toLowerCase(), s])), ...NAME_WORDS };
/** Names Mitoshi does not list: refused as unknown rather than ignored. */
const UNLISTED_ASSET_RE = /^(bnb|xrp|doge|ada|link|avax|coin|mstr|hood|nflx|spy|qqq|pepe|sui|trx|ton)$/;
/** Side words the parser understands; everything maps onto the venue's two outcomes. */
const SIDES: Record<string, Side> = { up: "up", down: "down", long: "up", short: "down", yes: "up", no: "down", over: "up", under: "down", higher: "up", lower: "down" };
/** Units that may trail a stake and mean nothing more than "dollars of pathUSD". */
const UNITS = new Set(["usd", "pathusd", "usdc", "dollars", "dollar", "bucks", "$"]);

export type XRefusalReason =
  | "empty"
  | "no-side"
  | "two-sides"
  | "no-asset"
  | "unknown-asset"
  | "two-assets"
  | "no-stake"
  | "bad-stake"
  | "two-stakes"
  | "no-cadence"
  | "cadence-not-listed"
  | "two-cadences"
  | "unknown-token";

export interface XInstruction {
  side: Side;
  asset: XAsset;
  cadence: XCadence;
  intervalSec: number;
  stakeBase: bigint;
}

export type XParse = { ok: true; instruction: XInstruction } | { ok: false; reason: XRefusalReason; token?: string };

/** The one line the UI shows as the grammar. */
export const X_GRAMMAR = "@handle <ticker> <up|down> <5m|15m|1h> <$stake>";
export const X_EXAMPLES = ["BTC up 5m $5", "$TSLA down 15m $10", "nvidia long 1h $25"] as const;

const STAKE_RE = /^\$?(\d+(?:\.\d+)?)$/;
const CADENCE_RE = /^(\d+)(m|h|d)$/;
/** A cashtag: `$` then a letter — `$TSLA`, `$btc`. `$5` is a stake. */
const CASHTAG_RE = /^\$([a-z][a-z0-9]{0,9})$/;

function stakeToBase(text: string, decimals: number): bigint | null {
  const [whole = "0", fraction = ""] = text.split(".");
  if (fraction.length > decimals) return null;
  return BigInt(whole) * oneUnit(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

/**
 * A mention becomes exactly one order or exactly one refusal. Tokens may come in any order; a second side, asset, stake
 * or cadence is ambiguity and refused rather than guessed, and a token carrying digits that is not a stake or a listed
 * cadence (e.g. "3x") is refused too — no leverage grammar here. Plain words outside the vocabulary are ignored.
 */
export function parseInstruction(text: string, options: { decimals: number }): XParse {
  const tokens = text
    .toLowerCase()
    .replace(/\b(\d+)\s*(?:minutes?|mins?)\b/g, "$1m")
    .replace(/\b(\d+)\s*(?:hours?|hrs?)\b/g, "$1h")
    .replace(/\b(\d+)\s*days?\b/g, "$1d")
    .replace(/(^|\s)60m(?=\s|$)/g, (_m, lead: string) => `${lead}1h`)
    .replace(/[,;:!?()"']/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !t.startsWith("@") && !t.startsWith("#") && !t.startsWith("http"));
  if (tokens.length === 0) return { ok: false, reason: "empty" };

  let side: Side | null = null;
  let asset: XAsset | null = null;
  let cadence: XCadence | null = null;
  let stakeText: string | null = null;

  for (const raw of tokens) {
    if (UNITS.has(raw)) continue;
    const cashtag = CASHTAG_RE.exec(raw);
    const token = cashtag ? (cashtag[1] as string) : raw;
    const sideWord = !cashtag && Object.hasOwn(SIDES, token) ? SIDES[token] : undefined;
    if (sideWord) {
      if (side) return { ok: false, reason: "two-sides", token };
      side = sideWord;
      continue;
    }
    const assetWord = Object.hasOwn(ASSETS, token) ? ASSETS[token] : undefined;
    if (assetWord) {
      if (asset && asset !== assetWord) return { ok: false, reason: "two-assets", token: raw };
      asset = assetWord;
      continue;
    }
    if (cashtag) return { ok: false, reason: "unknown-asset", token: raw };
    const cadenceMatch = CADENCE_RE.exec(token);
    if (cadenceMatch) {
      if (!Object.hasOwn(X_CADENCES, token)) return { ok: false, reason: "cadence-not-listed", token };
      if (cadence) return { ok: false, reason: "two-cadences", token };
      cadence = token as XCadence;
      continue;
    }
    const stakeMatch = STAKE_RE.exec(token);
    if (stakeMatch) {
      if (stakeText !== null) return { ok: false, reason: "two-stakes", token };
      stakeText = stakeMatch[1] as string;
      continue;
    }
    if (/\d/.test(token) || UNLISTED_ASSET_RE.test(token)) {
      return { ok: false, reason: /\d/.test(token) ? "unknown-token" : "unknown-asset", token };
    }
  }

  if (!side) return { ok: false, reason: "no-side" };
  if (!asset) return { ok: false, reason: "no-asset" };
  if (stakeText === null) return { ok: false, reason: "no-stake" };
  if (!cadence) return { ok: false, reason: "no-cadence" };
  const stakeBase = stakeToBase(stakeText, options.decimals);
  if (stakeBase === null || stakeBase <= 0n) return { ok: false, reason: "bad-stake", token: stakeText };
  return { ok: true, instruction: { side, asset, cadence, intervalSec: X_CADENCES[cadence], stakeBase } };
}

/** The refusal in words a reply can carry. */
export function describeRefusal(reason: XRefusalReason, token?: string): string {
  const near = token ? ` ("${token}")` : "";
  switch (reason) {
    case "empty":
      return "the mention carried no instruction";
    case "no-side":
      return "say up or down";
    case "two-sides":
      return `one side only${near}`;
    case "no-asset":
      return "name the asset, such as BTC or $TSLA";
    case "unknown-asset":
      return `that asset is not listed here${near}`;
    case "two-assets":
      return `one asset per call${near}`;
    case "no-stake":
      return "say how much, such as $5";
    case "bad-stake":
      return `the stake must be a positive number${near}`;
    case "two-stakes":
      return `one stake per call${near}`;
    case "no-cadence":
      return "add a Window: 5m, 15m or 1h";
    case "cadence-not-listed":
      return `use 5m, 15m or 1h${near}`;
    case "two-cadences":
      return `one Window per call${near}`;
    case "unknown-token":
      return `could not read${near}; no leverage or extras`;
  }
}

/** The stake of a share link's amount field, in base units; null for anything the grammar would refuse. */
export function parseStakeBase(text: string | null | undefined, decimals: number): bigint | null {
  const match = STAKE_RE.exec((text ?? "").trim());
  if (!match?.[1]) return null;
  const base = stakeToBase(match[1], decimals);
  return base === null || base <= 0n ? null : base;
}

/** The post the instruction builder copies: `@Mitoshi_app BTC UP 5m $5`. */
export function xInstructionText(handle: string, asset: XAsset, side: Side, cadence: XCadence, amount: string): string {
  return `@${handle.replace(/^@/, "")} ${TICKERS[asset].kind === "stock" ? `$${asset}` : asset} ${side.toUpperCase()} ${cadence} $${amount}`;
}
