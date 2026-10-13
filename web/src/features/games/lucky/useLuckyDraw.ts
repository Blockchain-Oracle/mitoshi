"use client";

// One Lucky spin, from the tap to the dealt Window (R4-9, D-227; ported from Masayume 68f7a09
// web/src/features/games/lucky/{useLuckyDraw.ts,useLuckyCheck.ts}). The browser's seed is made only after the
// commitment is in hand; once the deal is back, the browser recomputes the draw itself (keccak256 of the server seed is
// the commitment; HMAC-SHA256 of core's `luckyDrawMessage` maps to the same asset, side and reach) before the lever.
import { luckyDrawMessage, mapLuckyDraw } from "@cwf/core/games";
import type { Address, Bytes32, Hex } from "@cwf/core";
import { useCallback, useState } from "react";
import { keccak256 } from "viem";
import { useSocialSession } from "@/features/social/session";
import type { LuckyCommitWire, LuckyDealWire } from "./lucky-wire";

export type LuckyPhase = "idle" | "spinning" | "landing" | "dealt" | "refused" | "error";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `the draw server answered ${res.status}`);
  return json;
}

const hexOf = (bytes: Uint8Array): Hex => `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
const bytesOf = (hex: Hex): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer((hex.length - 2) / 2));
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16);
  return out;
};

/** The browser's own check of a deal: true when the commitment and the draw both recompute. */
export async function verifyDeal(deal: LuckyDealWire, wallet: Address): Promise<boolean> {
  if (keccak256(deal.serverSeed) !== deal.commitment) return false;
  const key = await crypto.subtle.importKey("raw", bytesOf(deal.serverSeed), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const message = luckyDrawMessage({ clientSeed: deal.clientSeed, wallet: wallet.toLowerCase() as Address, nonce: deal.nonce, policyVersion: deal.policyVersion });
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, bytesOf(message)));
  const draw = mapLuckyDraw(digest, { assets: deal.assets, multipliers: deal.multipliers });
  return draw.asset === deal.draw.asset && draw.side === deal.draw.side && draw.multiplier === deal.draw.multiplier;
}

export function useLuckyDraw() {
  const social = useSocialSession();
  const [phase, setPhase] = useState<LuckyPhase>("idle");
  const [deal, setDeal] = useState<LuckyDealWire | null>(null);
  const [error, setError] = useState<string | null>(null);

  const spin = useCallback(
    async (stakeBase: bigint) => {
      setError(null);
      setDeal(null);
      const session = await social.ensure();
      if (!session.ok) {
        setPhase("error");
        setError(session.reason === "refused" ? "the signature was declined" : "sign in to spin");
        return;
      }
      setPhase("spinning");
      try {
        const commit = await post<LuckyCommitWire>("/api/games/lucky/commit", { stakeBase: stakeBase.toString() });
        // The browser's seed exists only now, after the commitment it is bound against.
        const clientSeed = hexOf(crypto.getRandomValues(new Uint8Array(32))) as Bytes32;
        const dealt = await post<LuckyDealWire>("/api/games/lucky/reveal", { drawId: commit.drawId, clientSeed });
        setDeal(dealt);
        setPhase("landing");
      } catch (cause) {
        setPhase("error");
        setError((cause as Error).message);
      }
    },
    [social],
  );

  const landed = useCallback(() => setPhase((p) => (p === "landing" ? (deal?.result === "drawn" ? "dealt" : "refused") : p)), [deal]);
  const reset = useCallback(() => {
    setPhase("idle");
    setDeal(null);
    setError(null);
  }, []);

  return { phase, deal, error, spin, landed, reset };
}

export function reportPlaced(drawId: string, body: { status: "confirmed" | "refused" | "unknown"; txHash: Hex | null; costBase: string | null; quantityRaw: string | null; refusal: string | null }): void {
  void post("/api/games/lucky/placed", { drawId, ...body }).catch(() => undefined);
}
