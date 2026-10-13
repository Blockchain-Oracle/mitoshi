"use client";

// Ported from Owarine 90a91d71:web/src/features/games/SeasonBanner.tsx (R4-9, D-227) — Flicky's season strip, drawn: the
// trophy, the season's name in the pixel face, the escrow's real balance and the countdown. It renders only when the
// operator names a season; the prize line is the pool's own balance (money already in a contract), never the split's
// promise — and with no pool deployed it says the prize is not escrowed.
import { formatSeasonCountdown } from "@cwf/core/games";
import { formatBaseUnits } from "@cwf/core/units";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useNowMs } from "@/lib/clock";
import { TrophyMark } from "../art/PixelArt";
import { DUEL } from "./copy";
import type { SeasonWire } from "./season.server";

export function SeasonBanner() {
  const nowMs = useNowMs();
  const q = useQuery({
    queryKey: ["games", "season"],
    queryFn: async () => {
      const res = await fetch("/api/games/season", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as SeasonWire;
    },
    staleTime: 60_000,
    retry: 1,
  });
  const season = q.data?.season;
  if (!season) return null;
  const escrow = q.data?.escrow ?? null;
  const remainingMs = nowMs > 0 ? Date.parse(season.endsAt) - nowMs : null;
  const pool = escrow ? DUEL.season.pool(`$${formatBaseUnits(BigInt(escrow.balanceBase), 6, { minDp: 0 })}`) : DUEL.season.notEscrowed;
  return (
    <Link href="/games/rank" className="gm-season" aria-label={`${season.name}: ${pool}`}>
      <TrophyMark className="gm-season-trophy" />
      <span className="gm-season-text">
        <span className="gm-season-eyebrow">{DUEL.season.eyebrow}</span>
        <span className="gm-season-name">{season.name}</span>
        <span className="gm-season-line">
          {pool}
          {remainingMs !== null ? ` · ${remainingMs > 0 ? DUEL.season.endsIn(formatSeasonCountdown(remainingMs)) : DUEL.season.ended}` : null}
        </span>
      </span>
      <span className="gm-season-cta">{DUEL.season.cta} →</span>
    </Link>
  );
}
