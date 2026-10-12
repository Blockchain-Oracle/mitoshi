"use client";

import type { ArcadeGame } from "@cwf/core/games/arcade";
import { useCallback, useEffect, useState } from "react";
import { useWalletSession } from "@/lib/wallet-session";
/**
 * Who vouches for a run's poster. Mitoshi has no game room yet (S12b): every run is kept on this device and the board
 * route answers that this deployment keeps no scores, which the plates say in place.
 */
export type RoomAuth = { kind: "ready"; token: string } | { kind: "unavailable" } | { kind: "refused" } | { kind: "opening" };
import type { RunEnd } from "./run";
import type { BoardWire, ScoreAcceptedWire } from "./wire";

/**
 * The board and the post — Pips's `useMinigameLeaderboard`, with the posting identity the duel already
 * has: the browser key's room token, so no wallet prompt per run.
 *
 * `ability` says, before a run starts, what will happen to its score: posted, kept local because no
 * wallet is connected, kept local because this deployment keeps no scores, or kept local because the
 * room that vouches for a wallet is not configured here. The over plate says the same thing after.
 */
export type PostAbility = "yes" | "signedOut" | "noStore" | "unavailable" | "opening";

export type PostOutcome = { kind: "posted"; rank: number; isBest: boolean } | { kind: "refused"; why: string };

const BOARD_ENDPOINT = "/api/games/arcade/board";
const SCORE_ENDPOINT = "/api/games/arcade/score";

export function useArcadeScore(game: ArcadeGame, auth: RoomAuth) {
  const { address, isConnected } = useWalletSession();
  /** `undefined` until the route answers, `null` when it could not be reached. */
  const [board, setBoard] = useState<BoardWire | null | undefined>(undefined);

  const refresh = useCallback(() => {
    return fetch(`${BOARD_ENDPOINT}?game=${game}${address ? `&address=${address}` : ""}`)
      .then((response) => (response.ok ? (response.json() as Promise<BoardWire>) : Promise.reject(new Error(String(response.status)))))
      .then(setBoard)
      .catch(() => setBoard(null));
  }, [game, address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ability: PostAbility =
    board === undefined
      ? "opening"
      : board === null
        ? "unavailable"
        : !board.configured
          ? "noStore"
          : !isConnected || !address
            ? "signedOut"
            : auth.kind === "ready"
              ? "yes"
              : auth.kind === "unavailable" || auth.kind === "refused"
                ? "unavailable"
                : "opening";

  const post = useCallback(
    async (end: RunEnd): Promise<PostOutcome> => {
      if (auth.kind !== "ready" || !board) return { kind: "refused", why: "no room token to post with" };
      try {
        const score = JSON.stringify({ game, token: auth.token, seed: end.seed, engineVersion: board.engineVersion, durationMs: end.durationMs, score: end.score, calm: end.calm, trace: end.trace });
        const response = await fetch(SCORE_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: score,
        });
        const body = (await response.json()) as ScoreAcceptedWire & { error?: string };
        if (!response.ok) return { kind: "refused", why: body.error ?? `the server answered ${response.status}` };
        setBoard(body.board);
        return { kind: "posted", rank: body.rank, isBest: body.isBest };
      } catch (cause) {
        return { kind: "refused", why: String((cause as Error)?.message ?? "the post did not go through").slice(0, 120) };
      }
    },
    [auth, board, game],
  );

  return { board, refresh, post, ability };
}
