// Ported from Masayume 68f7a09:packages/core/src/games/room-token.test.ts
import { describe, expect, it } from "vitest";
import type { Address } from "../types/primitives";
import {
  canRenewRoomToken,
  mintRoomToken,
  parseRoomToken,
  renewRoomTokenClaims,
  roomAuthFresh,
  roomAuthMessage,
  roomSessionClaims,
  roomTokenExpiresAtMs,
  roomTokenPayload,
  ROOM_SESSION_MS,
  ROOM_TOKEN_TTL_MS,
  verifyRoomToken,
  type RoomTokenClaims,
} from "./room-token";

const WALLET = "0xd357000000000000000000000000000000009358" as Address;
const KEY = "0xA11CE00000000000000000000000000000000001" as Address;
const ARENA = "0xEC71498B3557c921813fFCF08a018316BCCDf0dF" as Address;
const OTHER_ARENA = `0x${"4d27".padEnd(40, "0")}` as Address;
const CHAIN = 50312;
const NOW = 1_756_900_000_000;

/**
 * A stand-in for the HMAC each Node side supplies. It has to depend on every byte of the payload — a
 * digest over only the length and the tail would call a forged wallet authentic, which is exactly the
 * bug this test double would otherwise hide.
 */
const secret = "test-secret";
const sign = (payload: string) => {
  let hash = 2_166_136_261;
  for (const char of `${secret}:${payload}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16_777_619) >>> 0;
  return `mac${hash.toString(16)}`;
};
const verify = (payload: string, mac: string) => mac === sign(payload);

const CLAIMS = roomSessionClaims(WALLET, KEY, CHAIN, ARENA, NOW);
const EXPECT = { chainId: CHAIN, arena: ARENA };

describe("the duel room token", () => {
  it("names the wallet, the key and the arena in the text the key signs, and says what it is not", () => {
    const message = roomAuthMessage({ wallet: WALLET, key: KEY, chainId: CHAIN, arena: ARENA, issuedAtMs: NOW });
    expect(message).toContain(WALLET.toLowerCase());
    expect(message).toContain(KEY.toLowerCase());
    expect(message).toContain(ARENA.toLowerCase());
    expect(message).toContain(`chain ${CHAIN}`);
    expect(message).toContain("moves no funds");
    expect(message).toContain("not the wallet");
    // The prompt for another arena, or from another key, is a different string, so a signature cannot be carried across.
    expect(roomAuthMessage({ wallet: WALLET, key: KEY, chainId: CHAIN, arena: OTHER_ARENA, issuedAtMs: NOW })).not.toBe(message);
    expect(roomAuthMessage({ wallet: WALLET, key: WALLET, chainId: CHAIN, arena: ARENA, issuedAtMs: NOW })).not.toBe(message);
  });

  it("holds a signature for five minutes, and tolerates a clock a minute fast", () => {
    expect(roomAuthFresh(NOW, NOW)).toBe(true);
    expect(roomAuthFresh(NOW, NOW + 4 * 60_000)).toBe(true);
    expect(roomAuthFresh(NOW, NOW + 6 * 60_000)).toBe(false);
    expect(roomAuthFresh(NOW + 30_000, NOW)).toBe(true);
    expect(roomAuthFresh(NOW + 120_000, NOW)).toBe(false);
  });

  it("lowercases and orders its claims, so a payload is one string for one set of facts", () => {
    expect(roomTokenPayload(CLAIMS)).toBe(`r2.${WALLET.toLowerCase()}.${KEY.toLowerCase()}.${CHAIN}.${ARENA.toLowerCase()}.${NOW}.${NOW + ROOM_SESSION_MS}`);
    expect(roomTokenPayload(roomSessionClaims(WALLET.toUpperCase() as Address, KEY.toUpperCase() as Address, CHAIN, ARENA.toUpperCase() as Address, NOW))).toBe(roomTokenPayload(CLAIMS));
  });

  it("accepts what it minted, and hands back the key beside the wallet", () => {
    const verdict = verifyRoomToken(mintRoomToken(CLAIMS, sign), EXPECT, NOW + 60_000, verify);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.claims.wallet).toBe(WALLET.toLowerCase());
      expect(verdict.claims.key).toBe(KEY.toLowerCase());
    }
  });

  it("refuses a token whose claims were edited after minting", () => {
    const token = mintRoomToken(CLAIMS, sign);
    const forged = token.replace(WALLET.toLowerCase(), "0xbbbb111111111111111111111111111111111111");
    expect(verifyRoomToken(forged, EXPECT, NOW, verify)).toEqual({ ok: false, code: "unauthenticated", why: "the room token is not ours" });
    // Swapping the key is the forgery that matters now: a stranger's key sat in a wallet's seat.
    const rekeyed = token.replace(KEY.toLowerCase(), "0xbbbb111111111111111111111111111111111111");
    expect(verifyRoomToken(rekeyed, EXPECT, NOW, verify).ok).toBe(false);
  });

  it("refuses a token minted for another arena, even with a good MAC", () => {
    const token = mintRoomToken(roomSessionClaims(WALLET, KEY, CHAIN, OTHER_ARENA, NOW), sign);
    const verdict = verifyRoomToken(token, EXPECT, NOW, verify);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe("forbidden");
  });

  it("refuses a token minted for another chain", () => {
    const token = mintRoomToken(roomSessionClaims(WALLET, KEY, 1, ARENA, NOW), sign);
    const verdict = verifyRoomToken(token, EXPECT, NOW, verify);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe("forbidden");
  });

  it("expires fifteen minutes after it was minted", () => {
    const token = mintRoomToken(CLAIMS, sign);
    expect(verifyRoomToken(token, EXPECT, NOW + ROOM_TOKEN_TTL_MS - 1, verify).ok).toBe(true);
    const late = verifyRoomToken(token, EXPECT, NOW + ROOM_TOKEN_TTL_MS, verify);
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.why).toContain("expired");
  });

  it("renews on the same session without a second signature, but never past its end", () => {
    const renewed = renewRoomTokenClaims(CLAIMS, NOW + ROOM_TOKEN_TTL_MS + 1);
    expect(renewed).not.toBeNull();
    expect(renewed?.sessionEndsAtMs).toBe(CLAIMS.sessionEndsAtMs);
    expect(renewed?.key).toBe(KEY.toLowerCase());
    expect(verifyRoomToken(mintRoomToken(renewed as RoomTokenClaims, sign), EXPECT, NOW + ROOM_TOKEN_TTL_MS + 2, verify).ok).toBe(true);

    const pastSession = NOW + ROOM_SESSION_MS + 1;
    expect(canRenewRoomToken(CLAIMS, pastSession)).toBe(false);
    expect(renewRoomTokenClaims(CLAIMS, pastSession)).toBeNull();
  });

  it("stops accepting a token at the session's end even when it was minted a moment before", () => {
    const late = roomSessionClaims(WALLET, KEY, CHAIN, ARENA, NOW);
    const nearEnd: RoomTokenClaims = { ...late, issuedAtMs: late.sessionEndsAtMs - 60_000 };
    expect(roomTokenExpiresAtMs(nearEnd)).toBe(nearEnd.sessionEndsAtMs);
    expect(verifyRoomToken(mintRoomToken(nearEnd, sign), EXPECT, nearEnd.sessionEndsAtMs, verify).ok).toBe(false);
  });

  it("refuses a token dated well into the future, which is how a rolled-back clock would mint one", () => {
    const ahead: RoomTokenClaims = { ...CLAIMS, issuedAtMs: NOW + 10 * 60_000 };
    expect(verifyRoomToken(mintRoomToken(ahead, sign), EXPECT, NOW, verify).ok).toBe(false);
  });

  it("refuses anything that is not the format — an r1 token among them — without calling the MAC", () => {
    let called = 0;
    const counting = (payload: string, mac: string) => {
      called += 1;
      return verify(payload, mac);
    };
    const r1 = `r1.${WALLET.toLowerCase()}.${CHAIN}.${ARENA.toLowerCase()}.${NOW}.${NOW + ROOM_SESSION_MS}.mac`;
    for (const bad of ["", "r1.a.b", r1, `r2.${WALLET.toLowerCase()}.notakey.${CHAIN}.${ARENA.toLowerCase()}.1.2.mac`]) {
      expect(verifyRoomToken(bad, EXPECT, NOW, counting).ok, bad).toBe(false);
    }
    expect(called).toBe(0);
    expect(parseRoomToken("r1.a.b")).toBeNull();
  });
});
