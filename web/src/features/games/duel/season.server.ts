import "server-only";
import { isOk } from "@cwf/core";
import { prizePoolTotalUnits, seasonConfigFrom, type SeasonConfig } from "@cwf/core/games";
import { getSeasonPool } from "@cwf/markets/arena";
import { configureMarkets, marketsEnv } from "@cwf/markets";
import { webEnv } from "@/lib/env";

/**
 * The season, server only (R4-9, D-227; Ported from Masayume 68f7a09:web/src/features/games/season.server.ts): the
 * operator's season from the environment (core `seasonConfigFrom`: `SEASON_ID`, `SEASON_ENDS_AT`, `SEASON_PRIZE_SPLIT`…)
 * beside the escrow's own balance, read from the SeasonPrizePool the arena fragment names. With no `SEASON_ID` there is
 * no season and no prize is invented — the banner does not render; with no pool deployed the page says the prize is not
 * escrowed rather than printing a promise as money.
 */
export interface SeasonWire {
  season: (SeasonConfig & { prizePool: { totalUnits: number } }) | null;
  escrow: { address: string; seasonId: string; endsAtSec: number; balanceBase: string; depositedBase: string; distributed: boolean } | null;
}

function ensureReads(origin: string): void {
  const env = webEnv.markets;
  const indexUrl = /^https?:\/\//.test(env.indexUrl) ? env.indexUrl : `${origin}${env.indexUrl}`;
  if (marketsEnv().indexUrl === indexUrl && marketsEnv().network === env.network) return;
  configureMarkets({ ...env, indexUrl });
}

export async function seasonView(origin: string): Promise<SeasonWire> {
  const config = seasonConfigFrom(process.env);
  if (!config) return { season: null, escrow: null };
  ensureReads(origin);
  const pool = await getSeasonPool();
  const state = isOk(pool) ? pool.value : null;
  return {
    season: { ...config, prizePool: { totalUnits: prizePoolTotalUnits(config.prizeSplit) } },
    escrow: state ? { address: state.address, seasonId: state.seasonId, endsAtSec: state.endsAtSec, balanceBase: state.balanceBase.toString(), depositedBase: state.depositedBase.toString(), distributed: state.distributed } : null,
  };
}
