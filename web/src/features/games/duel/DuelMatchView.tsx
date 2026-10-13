"use client";

// /games/duel/<matchId> — one duel, for anyone with the link (R4-9, D-227; Owarine 90a91d71:web/src/features/games/duel/
// DuelPublicResult.tsx's role): both P&Ls and each card as the arena says it, and the cranks anyone may send.
import { useNowMs } from "@/lib/clock";
import { useWalletSession } from "@/lib/wallet-session";
import { DUEL } from "./copy";
import { DuelResult } from "./DuelParts";
import { cranksFor } from "./DuelStage";
import { useDuelMatch, useDuelWrite } from "./useDuel";
import "./duel.css";

export function DuelMatchView({ matchId }: { matchId: string }) {
  const { address } = useWalletSession();
  const match = useDuelMatch(/^0x[0-9a-fA-F]{64}$/.test(matchId) ? matchId.toLowerCase() : null);
  const { write, busy } = useDuelWrite(matchId.toLowerCase());
  const nowMs = useNowMs();
  const m = match.data;
  return (
    <div className="gm-page du-stage">
      {m ? (
        <DuelResult match={m} me={address ?? m.creator} cranks={cranksFor(m, address, nowMs, write)} busy={busy} onAgain={() => window.location.assign("/games/duel")} />
      ) : (
        <p className="du-note">{match.isError ? DUEL.offline : DUEL.sending}</p>
      )}
    </div>
  );
}
