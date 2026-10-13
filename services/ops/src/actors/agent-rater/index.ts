/**
 * agent-rater (S9.6; AG-15, D-218.6): rates each strategy's ERC-8004 agent once per completed UTC day on the agent's
 * own calls that settled that day — the return on stake of its follow fills (`rateDay`), posted as `giveFeedback`
 * (`pnl`, the day) with self-contained evidence (a data: URI; its keccak on chain). A separate key from every agent's
 * owner (the registry refuses self-feedback), never twice for a day (the index's feedback rows decide), and DRY unless
 * `AGENT_RATER_LIVE=1` on top of the global switch — the owner turns it on. Cadence: `AGENT_RATER_EVERY_SEC`
 * (default one pass a day, the first at boot). Opt-in (`OPS_ACTORS`); pays its own gas (`sendOps`).
 */
import { keccak256, toBytes, type Address, type Hex } from "viem";
import { RATING_TAG, rateDay, ratingEvidence, utcDayLabel, type SettledFill } from "@cwf/core";
import { createPgStrategyStore } from "@cwf/db";
import { readIndexedStrategies, readRatedDays } from "@cwf/db/idx";
import { giveFeedbackCall, registrationUrl } from "@cwf/markets";
import { createOpsClient, fetchMarkets, runnerVenueOf, sendOps, type MarketView } from "@cwf/markets/ops";
import { errorText, roleKey, runActor, type VenueDeps } from "../../runtime";

const DAY_SEC = 86_400;

export function startAgentRater(deps: Pick<VenueDeps, "env" | "log" | "sql">): { stop: () => void } {
  const key = roleKey("agent-rater", deps.env.network, process.env, deps.env.keysDir);
  const client = createOpsClient({ network: deps.env.network, rpcUrl: deps.env.tempoRpcUrl, privateKey: key });
  const rv = runnerVenueOf(client.chainId);
  const live = process.env.AGENT_RATER_LIVE === "1";
  const dryRun = deps.env.dryRun || !key || !live;
  const everyMs = (Number(process.env.AGENT_RATER_EVERY_SEC) >= 60 ? Number(process.env.AGENT_RATER_EVERY_SEC) : DAY_SEC) * 1000;
  const origin = (process.env.WEB_ORIGIN ?? deps.env.corsOrigins[0] ?? "https://mitoshi.xyz").replace(/\/$/, "");
  const rater = (client.address ?? "0x0000000000000000000000000000000000000000") as Address;
  const store = deps.sql ? createPgStrategyStore(deps.sql) : null;

  const pass = async () => {
    if (!rv) return { why: "StrategyRegistry is not deployed on this network; idle" };
    if (!deps.sql || !store) return { why: "no DATABASE_URL: idle" };
    const today = utcDayLabel(Math.floor(Date.now() / 1000));
    const strategies = (await readIndexedStrategies(deps.sql, { registry: rv.registry })).filter((s) => s.agentId !== null);
    const notes: string[] = [];
    const markets = new Map<string, MarketView | null>();
    for (const s of strategies) {
      if (s.runner === rater.toLowerCase() || s.creator === rater.toLowerCase()) {
        notes.push(`#${s.strategyId}: this key runs or owns it; a separate rater must rate it`);
        continue;
      }
      const fills = (await store.listFills({ strategyId: s.strategyId, limit: 5_000 })).filter((f) => f.mode === "follow");
      const ids = [...new Set(fills.map((f) => f.marketId))].filter((m) => !markets.has(m));
      if (ids.length) (await fetchMarkets(client, rv, ids as Hex[])).forEach((m, i) => markets.set(ids[i]!, m));
      const byDay = new Map<string, SettledFill[]>();
      for (const f of fills) {
        const m = markets.get(f.marketId);
        if (!m || (m.state !== 1 && m.state !== 2)) continue;
        const day = utcDayLabel(m.expirySec);
        if (day >= today) continue;
        const numerator = BigInt(f.side === "up" ? m.payoutYes : m.payoutNo);
        byDay.set(day, [...(byDay.get(day) ?? []), { txHash: f.txHash, cashDeltaBase: BigInt(f.cashDelta), tokenDeltaRaw: BigInt(f.tokenDelta), payoutNumerator: numerator }]);
      }
      if (byDay.size === 0) {
        notes.push(`#${s.strategyId} (agent ${s.agentId}): no settled calls on a completed day yet`);
        continue;
      }
      const rated = await readRatedDays(deps.sql, s.agentId!, rater, RATING_TAG);
      for (const [day, dayFills] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) {
        if (rated.has(day)) continue;
        const rating = rateDay(day, dayFills);
        if (rating.valueCentiPct === null) continue;
        const evidence = ratingEvidence({ agentId: BigInt(s.agentId!), strategyId: s.strategyId, rating, fills: dayFills });
        const pct = `${rating.valueCentiPct >= 0n ? "+" : ""}${(Number(rating.valueCentiPct) / 100).toFixed(2)}%`;
        const what = `agent ${s.agentId} for ${day}: ${pct} over ${rating.settled} settled call${rating.settled === 1 ? "" : "s"}`;
        if (dryRun) {
          notes.push(`DRY would rate ${what}`);
          continue;
        }
        try {
          const call = giveFeedbackCall(client.chainId, {
            agentId: BigInt(s.agentId!), value: rating.valueCentiPct, valueDecimals: 2, tag1: RATING_TAG, tag2: day, endpoint: registrationUrl(origin, s.strategyId),
            feedbackURI: `data:application/json;base64,${Buffer.from(evidence).toString("base64")}`, feedbackHash: keccak256(toBytes(evidence)),
          });
          const sent = await sendOps(client, [call]);
          notes.push(`rated ${what} ${sent.hash.slice(0, 10)}`);
        } catch (error) {
          notes.push(`${what} not rated: ${errorText(error).slice(0, 140)}`);
        }
      }
    }
    return { why: `${strategies.length} agent${strategies.length === 1 ? "" : "s"}${notes.length ? ` | ${notes.slice(0, 6).join(" | ")}` : ""}${dryRun ? ` · DRY${live ? "" : " (AGENT_RATER_LIVE unset)"}` : ""}`, detail: { rater, live: !dryRun } };
  };

  deps.log(`agent-rater ${rater} every ${everyMs / 1000} s${dryRun ? " (dry)" : ""}`);
  return runActor({ name: "agent-rater", log: deps.log, dryRun, everyMs, pass, critical: false });
}
