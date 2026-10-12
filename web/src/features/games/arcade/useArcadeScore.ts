"use client";

import type { ArcadeGame } from "@cwf/core/games/arcade";
import { useCallback, useEffect, useState } from "react";
import { useSocialSession } from "@/features/social/session";
import { useWalletSession } from "@/lib/wallet-session";
import type { RunEnd } from "./run";
import type { BoardWire, ScoreAcceptedWire } from "./wire";

/**
 * The board and the post — Pips's `useMinigameLeaderboard` as Owarine ports it, with Mitoshi's poster: the one
 * session every social write uses (D-226). A passkey account posts with no prompt; any other wallet signs once, the
 * same signature a room message asks for.
 *
 * `ability` says, before a run starts, what will happen to its score: posted, kept local because no wallet is
 * connected, or kept local because this deployment keeps no scores. The over plate says the same thing after.
 */
export type PostAbility = "yes" | "signedOut" | "noStore" | "unavailable" | "opening";

export type PostOutcome = { kind: "posted"; rank: number; isBest: boolean } | { kind: "refused"; why: string };

const BOARD_ENDPOINT = "/api/games/arcade/board";
const SCORE_ENDPOINT = "/api/games/arcade/score";

export function useArcadeScore(game: ArcadeGame) {
  const { address, isConnected } = useWalletSession();
  const social = useSocialSession();
  /** `undefined` until the route answers, `null` when it could not be reached. */
  const [board, setBoard] = useState<BoardWire | null | undefined>(undefined);

  const refresh = useCallback(() => {
    return fetch(`${BOARD_ENDPOINT}?game=${game}${address ? `&address=${address}` : ""}`, { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<BoardWire>) : Promise.reject(new Error(String(response.status)))))
      .then(setBoard)
      .catch(() => setBoard(null));
  }, [game, address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signedIn = (isConnected && !!address) || !!social.address;
  const ability: PostAbility = board === undefined ? "opening" : board === null ? "unavailable" : !board.configured ? "noStore" : signedIn ? "yes" : "signedOut";

  const post = useCallback(
    async (end: RunEnd): Promise<PostOutcome> => {
      if (!board) return { kind: "refused", why: "the board did not answer" };
      const session = await social.ensure();
      if (!session.ok) return { kind: "refused", why: session.reason === "refused" ? "the signature was declined" : "sign in to post" };
      try {
        const response = await fetch(SCORE_ENDPOINT, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ game, seed: end.seed, engineVersion: board.engineVersion, durationMs: end.durationMs, score: end.score, calm: end.calm, trace: end.trace }),
        });
        const body = (await response.json()) as ScoreAcceptedWire & { error?: string };
        if (!response.ok) return { kind: "refused", why: body.error ?? `the server answered ${response.status}` };
        setBoard(body.board);
        return { kind: "posted", rank: body.rank, isBest: body.isBest };
      } catch (cause) {
        return { kind: "refused", why: String((cause as Error)?.message ?? "the post did not go through").slice(0, 120) };
      }
    },
    [board, game, social],
  );

  return { board, refresh, post, ability };
}
