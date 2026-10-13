"use client";
// History signed out (R6 games §4.9, T10): the page's own three sections filled with everyone's latest from the public
// reads — runs (`/api/games/arcade/recent`), decided duels (`/api/games/duel/recent`), Lucky draws
// (`/api/games/lucky/recent`) — each row with whose it is, inside the kit's SignedOutPreview (one "Sign in to see yours";
// sign-in at the end, never a wall). The preview is inert, so a section with nothing to show — empty, or a read that
// failed — sits under it where its action and Retry can be tapped.
import { SignedOutPreview } from "@/components/states/SignedOutPreview";
import { GAMES } from "../copy";
import { useDuelRecent } from "../duel/DuelFloor";
import { useRecentRunsQuery } from "../hall/data";
import { useRecentDraws } from "../lucky/LuckyFloor";
import { AllFailed, HistoryRow, HistorySection, publicDrawRow, publicDuelRow, runRow, type RowProps, type SectionEmpty, type SectionRead } from "./HistoryParts";

const H = GAMES.history;
const P = H.publicEmpties;

interface Section {
  title: string;
  q: SectionRead;
  /** Undefined while the first read is out or after it failed. */
  rows: (RowProps & { key: string })[] | undefined;
  empty: SectionEmpty;
}

function Lists({ sections }: { sections: Section[] }) {
  return sections.map((s) => (
    <HistorySection key={s.title} title={s.title} q={s.q} count={s.rows?.length} empty={s.empty}>
      {s.rows?.map(({ key, ...row }) => <HistoryRow key={key} {...row} />)}
    </HistorySection>
  ));
}

export function HistoryPreview() {
  const runs = useRecentRunsQuery();
  const duels = useDuelRecent();
  const draws = useRecentDraws();
  const sections: Section[] = [];
  if (runs.data?.configured !== false) {
    sections.push({ title: H.runsTitle, q: runs, rows: runs.data?.rows.map((r) => ({ key: `${r.game}-${r.wallet}-${r.at}`, ...runRow(r, true) })), empty: P.runs });
  }
  if (duels.data?.configured !== false) {
    sections.push({ title: H.duelTitle, q: duels, rows: duels.data?.rows.map((r) => ({ key: r.matchId, ...publicDuelRow(r) })), empty: P.duels });
  }
  if (draws.data?.configured !== false) {
    sections.push({ title: H.luckyTitle, q: draws, rows: draws.data?.rows.map((r) => ({ key: r.drawId, ...publicDrawRow(r) })), empty: P.draws });
  }
  // Until every read has answered, the preview holds all three (bones where a read is out); then the filled ones stay
  // in it and the rest move under it, tappable.
  const settled = sections.every((s) => s.rows !== undefined || s.q.isError);
  const filled = (s: Section) => (s.rows?.length ?? 0) > 0;
  const inside = settled ? sections.filter(filled) : sections;
  const under = settled ? sections.filter((s) => !filled(s)) : [];
  if (settled && sections.length > 0 && sections.every((s) => s.rows === undefined)) {
    return (
      <div className="gm-page rk">
        <AllFailed reads={sections.map((s) => s.q)} />
      </div>
    );
  }
  return (
    <div className="gm-page rk">
      {inside.length > 0 ? (
        <SignedOutPreview intent={H.preview.intent} source={H.preview.source} title={H.preview.title}>
          <div className="rk">
            <Lists sections={inside} />
          </div>
        </SignedOutPreview>
      ) : null}
      <Lists sections={under} />
    </div>
  );
}
