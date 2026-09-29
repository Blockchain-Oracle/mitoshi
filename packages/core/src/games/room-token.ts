// Ported from Masayume 68f7a09:packages/core/src/games/room-token.ts
import type { Address } from "../types/primitives";
import { isAddress } from "../types/primitives";
import type { RoomErrorCode } from "./protocol";

/**
 * The credential that opens a duel room, and the message the browser's own key signs to get one.
 *
 * A WebSocket upgrade is a GET with no body, so whatever authenticates it has to fit in a string that
 * the browser can attach and the room server can check without asking anything else. That string is this
 * token: claims plus a MAC over them, minted by the web app after it has verified a signature, and
 * verified by the ops room server against the same shared secret.
 *
 * **The wallet does not sign this.** Flicky's room takes a bare `hello(address)` and lets the chain be the
 * authority for everything that costs money; the wallet signs nothing before the entry. Here the browser's
 * game key — the key the entry transaction will name as the seat's agent — signs a message that claims a
 * wallet, so the room asks the wallet for no prompt at all and still holds a signature it can check. Before
 * the entry the claim is exactly as trusted as the reference's `hello`; from the entry on, the arena's own
 * `agentOf(matchId, wallet)` is what the room checks a socket's key against, so a key the chain never named
 * cannot sit in a seat's room (`handlers.ts` §sendSnapshot).
 *
 * Three properties are deliberate.
 *
 * **It is bound to one arena on one chain.** A token minted for the Shannon deployment cannot open a room
 * on another, which is the same rule the deck commitment enforces on-chain.
 *
 * **It carries two clocks.** `issuedAtMs` bounds how long one token is good for — fifteen minutes, so a
 * copied URL is not a durable credential — while `sessionEndsAtMs` bounds how long the *signature* behind
 * it may keep minting new ones. A re-mint costs no prompt now, but a token that renews rather than re-signs
 * is one fewer thing for a phone mid-swipe to do.
 *
 * **No crypto lives here.** `@masayume/core` stays free of platform dependencies, so the HMAC is passed in
 * — the same shape `verifyDeckCommitment` uses for keccak. Both callers hold one line of `node:crypto`
 * each; everything that could be got subtly wrong — the claim order, the clock comparisons, the arena
 * binding — is here, and tested once.
 *
 * This is not the Stage 3 comment Room's token (`web/src/features/room/gate.server.ts`), which gates a
 * market's chat on holding a position. Same idea, different room and different claim.
 */

/** A signature is only good for a few minutes, so a captured one cannot be presented tomorrow. */
export const ROOM_AUTH_TTL_MS = 5 * 60_000;
/** One token's life. A room that outlives it renews rather than re-signing. */
export const ROOM_TOKEN_TTL_MS = 15 * 60_000;
/** How long one signature may keep renewing. Past this, the key signs again — silently, once a sitting. */
export const ROOM_SESSION_MS = 12 * 60 * 60_000;
/** A client clock a minute ahead is common and harmless; an hour ahead is not. */
export const ROOM_CLOCK_SLACK_MS = 60_000;

/** `r1` carried no key and was signed by the wallet; a token of that shape is refused on its format. */
const VERSION = "r2";

export interface RoomTokenClaims {
  wallet: Address;
  /** The browser key that signed for this wallet — the one an entry names as the seat's agent. */
  key: Address;
  chainId: number;
  arena: Address;
  issuedAtMs: number;
  /** The absolute end of the signed session. Renewal may move `issuedAtMs`, never this. */
  sessionEndsAtMs: number;
}

/** The exact text the key signs. It names the wallet it claims, the arena, and what it is not, because people read these. */
export function roomAuthMessage(claims: Pick<RoomTokenClaims, "wallet" | "key" | "chainId" | "arena"> & { issuedAtMs: number }): string {
  return [
    "Masayume — open the duel room",
    "",
    `Wallet: ${claims.wallet.toLowerCase()}`,
    `Key: ${claims.key.toLowerCase()}`,
    `Arena: ${claims.arena.toLowerCase()} on chain ${claims.chainId}`,
    `Issued: ${new Date(claims.issuedAtMs).toISOString()}`,
    "",
    "This browser's own key signs this, not the wallet. It opens the wallet's duel rooms; the entry transaction is what names the key on chain. It is not a transaction, it moves no funds, and it costs nothing.",
  ].join("\n");
}

export function roomAuthFresh(issuedAtMs: number, nowMs: number): boolean {
  const age = nowMs - issuedAtMs;
  return age <= ROOM_AUTH_TTL_MS && age >= -ROOM_CLOCK_SLACK_MS;
}

/** Claims for a key that has just signed for a wallet: a fresh token on a session ending twelve hours out. */
export function roomSessionClaims(wallet: Address, key: Address, chainId: number, arena: Address, nowMs: number): RoomTokenClaims {
  return {
    wallet: wallet.toLowerCase() as Address,
    key: key.toLowerCase() as Address,
    chainId,
    arena: arena.toLowerCase() as Address,
    issuedAtMs: nowMs,
    sessionEndsAtMs: nowMs + ROOM_SESSION_MS,
  };
}

/** The dot-joined claims a MAC is taken over. Addresses lowercased, numbers decimal — no field may contain a dot. */
export function roomTokenPayload(claims: RoomTokenClaims): string {
  return [VERSION, claims.wallet.toLowerCase(), claims.key.toLowerCase(), claims.chainId, claims.arena.toLowerCase(), claims.issuedAtMs, claims.sessionEndsAtMs].join(".");
}

export type SignPayload = (payload: string) => string;
export type VerifyMac = (payload: string, mac: string) => boolean;

export function mintRoomToken(claims: RoomTokenClaims, sign: SignPayload): string {
  const payload = roomTokenPayload(claims);
  return `${payload}.${sign(payload)}`;
}

/** When this token stops being accepted: its own life, or the session's end, whichever comes first. */
export function roomTokenExpiresAtMs(claims: RoomTokenClaims): number {
  return Math.min(claims.issuedAtMs + ROOM_TOKEN_TTL_MS, claims.sessionEndsAtMs);
}

/** True while the signature behind a token may still mint another one. */
export function canRenewRoomToken(claims: RoomTokenClaims, nowMs: number): boolean {
  return nowMs < claims.sessionEndsAtMs;
}

/** A fresh token on the same session — the renewal that keeps a long duel from re-signing mid-swipe. */
export function renewRoomTokenClaims(claims: RoomTokenClaims, nowMs: number): RoomTokenClaims | null {
  return canRenewRoomToken(claims, nowMs) ? { ...claims, issuedAtMs: nowMs } : null;
}

interface ParsedRoomToken {
  payload: string;
  mac: string;
  claims: RoomTokenClaims;
}

/** Structure only — nothing here is trusted until the MAC has been checked against it. */
export function parseRoomToken(token: string): ParsedRoomToken | null {
  const parts = token.split(".");
  if (parts.length !== 8) return null;
  const [version, wallet, key, chainId, arena, issuedAtMs, sessionEndsAtMs, mac] = parts as [string, string, string, string, string, string, string, string];
  if (version !== VERSION || !mac) return null;
  if (!isAddress(wallet) || !isAddress(key) || !isAddress(arena)) return null;
  if (!/^\d+$/.test(chainId) || !/^\d+$/.test(issuedAtMs) || !/^\d+$/.test(sessionEndsAtMs)) return null;
  return {
    payload: parts.slice(0, 7).join("."),
    mac,
    claims: {
      wallet: wallet.toLowerCase() as Address,
      key: key.toLowerCase() as Address,
      chainId: Number(chainId),
      arena: arena.toLowerCase() as Address,
      issuedAtMs: Number(issuedAtMs),
      sessionEndsAtMs: Number(sessionEndsAtMs),
    },
  };
}

export interface RoomTokenExpectation {
  chainId: number;
  arena: Address;
}

export type RoomTokenVerdict = { ok: true; claims: RoomTokenClaims } | { ok: false; code: RoomErrorCode; why: string };

function refuse(code: RoomErrorCode, why: string): RoomTokenVerdict {
  return { ok: false, code, why };
}

/**
 * The upgrade's whole check. The MAC is verified before any claim is read, so a forged token is refused
 * on its signature and nothing else — the specific refusals below are only ever produced for tokens we
 * really minted, where telling the client "expired" (renew) apart from "another arena" (stop) is useful
 * rather than an oracle.
 */
export function verifyRoomToken(token: string, expect: RoomTokenExpectation, nowMs: number, verifyMac: VerifyMac): RoomTokenVerdict {
  const parsed = parseRoomToken(token);
  if (!parsed) return refuse("unauthenticated", "the room token is malformed");
  if (!verifyMac(parsed.payload, parsed.mac)) return refuse("unauthenticated", "the room token is not ours");

  const { claims } = parsed;
  if (claims.chainId !== expect.chainId || claims.arena !== expect.arena.toLowerCase()) {
    return refuse("forbidden", "this room token was minted for another arena");
  }
  if (claims.issuedAtMs - nowMs > ROOM_CLOCK_SLACK_MS) return refuse("unauthenticated", "the room token is not valid yet");
  if (nowMs >= roomTokenExpiresAtMs(claims)) return refuse("unauthenticated", "the room token has expired");
  return { ok: true, claims };
}
