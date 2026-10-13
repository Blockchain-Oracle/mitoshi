"use client";

// /games/history (R4-9, D-227; Owarine 90a91d71 app/games/history = DuelHistory + LuckyHistory, each from its own record):
// your replayed arcade runs, newest first — game, score, where it ranks on its board now, the seed it was drawn from and
// when — from `GET /api/games/arcade/runs`; then your duels (`/api/games/duel/history`) and your Lucky draws
// (`/api/games/lucky/history`). R6 games §4.9: each section is HistoryParts' frame (bones, error with Retry, an inline
// empty with its game); a section this deployment doesn't keep is hidden, and with none kept the page says so. Signed
// out it is the same page filled with everyone's latest (HistoryPreview), never a sign-in button on its own.
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/states";
import { useWalletSession } from "@/lib/wallet-session";
import { GAMES } from "../copy";
import { useDuelHistory } from "../duel/useDuelHistory";
import { LUCKY } from "../lucky/copy";
import { useLuckyHistory } from "../lucky/useLuckyHistory";
import { HistoryPreview } from "./HistoryPreview";
import { AllFailed, HistoryRow, HistorySection, drawRow, duelRow, runRow, type RunLike } from "./HistoryParts";
import "../rank/rank.css";

const H = GAMES.history;
const E = H.empties;

function useRuns(address: string | null) {
  return useQuery({
    queryKey: ["games", "arcade", "runs", address],
    queryFn: async () => {
      const res = await fetch(`/api/games/arcade/runs?address=${address}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { configured: boolean; rows: (RunLike & { rank: number | null })[] };
    },
    enabled: address !== null,
    retry: 1,
  });
}

const kept = (q: { data?: { configured: boolean } }) => !(q.data && !q.data.configured);

/** The wallet is still being restored: the page's own three sections as bones, not the signed-out preview. */
function Restoring() {
  const idle = { isError: false, refetch: () => undefined };
  return (
    <div className="gm-page rk">
      {[H.runsTitle, H.duelTitle, H.luckyTitle].map((title) => (
        <HistorySection key={title} title={title} q={idle} count={undefined} empty={E.runs}>{null}</HistorySection>
      ))}
    </div>
  );
}

function YourHistory({ address }: { address: string }) {
  const runs = useRuns(address);
  const duels = useDuelHistory(address);
  const draws = useLuckyHistory(address);
  if (!kept(runs) && !kept(duels) && !kept(draws)) {
    return (
      <div className="gm-page rk">
        <EmptyState why={H.none.why} detail={H.none.detail} nextAction={{ label: H.none.action, href: "/games" }} />
      </div>
    );
  }
  if (runs.isError && duels.isError && draws.isError && !runs.data && !duels.data && !draws.data) {
    return (
      <div className="gm-page rk">
        <AllFailed reads={[runs, duels, draws]} />
      </div>
    );
  }
  return (
    <div className="gm-page rk">
      {kept(runs) ? (
        <HistorySection title={H.runsTitle} q={runs} count={runs.data?.rows.length} empty={E.runs}>
          {runs.data?.rows.map((r) => <HistoryRow key={`${r.game}-${r.at}`} {...runRow(r)} />)}
        </HistorySection>
      ) : null}
      {kept(duels) ? (
        <HistorySection title={H.duelTitle} q={duels} count={duels.data?.rows.length} empty={E.duels}>
          {duels.data?.rows.map((r) => <HistoryRow key={r.matchId} {...duelRow(r)} />)}
        </HistorySection>
      ) : null}
      {kept(draws) ? (
        <HistorySection
          title={H.luckyTitle}
          q={draws}
          count={draws.data?.rows.length}
          empty={E.draws}
          aside={draws.data && draws.data.best > 0 ? <p className="rk-row-sub">{LUCKY.streak(draws.data.streak, draws.data.best)}</p> : null}
        >
          {draws.data?.rows.map((r) => <HistoryRow key={r.drawId} {...drawRow(r)} />)}
        </HistorySection>
      ) : null}
    </div>
  );
}

export function GamesHistory() {
  const { address, isConnecting } = useWalletSession();
  if (address) return <YourHistory address={address} />;
  return isConnecting ? <Restoring /> : <HistoryPreview />;
}
