"use client";
// `/launch` (S17; R4-11, D-227; R6 money S08, D-230) — a launchpad board, from the index in one request (`/api/launch`):
// the head (Launch and the two create pills — the accent one is the action), three stats (Launches · Raised · Top
// graduating — the profile stat row's grammar, 6835 lineage), TextTabs Trending · New · Graduating · Graduated with the
// edge fade (10484), the Test launches switch (the team's QA keys, hidden by default, always reachable by link), then
// the rows (`BoardRow`, 20110): a table on the stage's wide measure from 1024 px, cards on a phone. Coinbase's top
// gainers and Phantom's token list are the references (Refero 995d0fe8, e9240843). Sort and switch live in the URL.
import type { LaunchBoardWire } from "@cwf/core";
import { launchKeys, useLaunchBoard } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { Rocket, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Pill, PillLink } from "@/components/kit/Pill";
import { TextTabs } from "@/components/kit/TextTabs";
import { EmptyState, StateFrame } from "@/components/states/EmptyState";
import { Switch } from "@/components/ui/switch";
import { useNowMs } from "@/lib/clock";
import { BoardRow } from "./BoardRow";
import { isBoardSort, sortBoard, type BoardSort } from "./board-sort";
import { LAUNCH } from "./copy";
import { usdShort } from "./format";
import { BoardLoading } from "./islands";
import "@/styles/launch.css";
import "@/components/kit/kit.css";

function Stats({ board }: { board: LaunchBoardWire | null }) {
  const H = LAUNCH.head;
  const top = board?.head.top ?? null;
  return (
    <dl className="lp-stats">
      <div className="lp-stat"><dt>{H.launches}</dt><dd className="numbers">{board ? board.head.count : "—"}</dd></div>
      <div className="lp-stat"><dt>{H.raised}</dt><dd className="numbers">{board ? usdShort(board.head.raisedBase) : "—"}</dd></div>
      <div className="lp-stat">
        <dt>{H.top}</dt>
        <dd className="numbers">{top ? <Link href={`/launch/${top.token}`} className="lp-stat-link">${top.symbol} {Math.floor(top.progressBps / 100)}%</Link> : "—"}</dd>
      </div>
    </dl>
  );
}

export function LaunchScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const sortParam = params.get("sort");
  const sort: BoardSort = isBoardSort(sortParam) ? sortParam : "trending";
  const includeTeam = params.get("test") === "1";
  const reading = useLaunchBoard(includeTeam);
  const queryClient = useQueryClient();
  const nowMs = useNowMs();
  const set = (next: { sort?: BoardSort; test?: boolean }) => {
    const q = new URLSearchParams(params.toString());
    if (next.sort) (next.sort === "trending" ? q.delete("sort") : q.set("sort", next.sort));
    if (next.test !== undefined) (next.test ? q.set("test", "1") : q.delete("test"));
    router.replace(`${path}${q.size ? `?${q}` : ""}`, { scroll: false });
  };
  const board = reading?.ok ? reading.value : null;
  const rows = board ? sortBoard(board.rows, sort) : [];
  const T = LAUNCH.tabEmpty;
  const notDeployed = reading !== null && !reading.ok && reading.error.kind === "not-deployed";

  let body;
  if (reading === null) body = <BoardLoading />;
  else if (notDeployed) body = <EmptyState icon={<Rocket />} why={LAUNCH.notDeployed} nextAction={{ label: LAUNCH.seeMarkets, href: "/markets" }} />;
  else if (!reading.ok) body = <StateFrame tone="warning" role="alert" icon={<TriangleAlert />} title={LAUNCH.failed} actions={<Pill tone="ink" size="sm" onClick={() => void queryClient.invalidateQueries({ queryKey: launchKeys.board(includeTeam) })}>{LAUNCH.retry}</Pill>} />;
  else if (board && board.rows.length === 0)
    body = (
      <EmptyState
        icon={<Rocket />}
        why={LAUNCH.empty.why}
        detail={LAUNCH.empty.detail}
        nextAction={{ label: LAUNCH.empty.launch, href: "/launch/meme" }}
        secondaryAction={!includeTeam && board.teamCount > 0 ? { label: LAUNCH.empty.showTest(board.teamCount), onClick: () => set({ test: true }) } : undefined}
      />
    );
  else if (rows.length === 0)
    body = <EmptyState size="inline" why={sort === "graduated" ? T.graduated : sort === "graduating" ? T.graduating : T.any} nextAction={sort === "graduated" ? { label: T.seeGraduating, onClick: () => set({ sort: "graduating" }) } : { label: T.seeNew, onClick: () => set({ sort: "new" }) }} />;
  else
    body = (
      <div className="lp-board">
        <div className="lp-brow lp-brow-head" aria-hidden>
          <span>#</span>
          <span />
          <span>{LAUNCH.cols.coin}</span>
          <span className="lp-brow-cap">{LAUNCH.cols.mcap}</span>
          <span className="lp-brow-vol">{LAUNCH.cols.vol}</span>
          <span className="lp-brow-holders">{LAUNCH.cols.holders}</span>
          <span className="lp-brow-age">{LAUNCH.cols.age}</span>
          <span>{LAUNCH.cols.progress}</span>
          <span />
          <span className="lp-brow-price">{LAUNCH.cols.price}</span>
        </div>
        <ol className="lp-board-list" aria-label={LAUNCH.listLabel}>
          {rows.map((r, i) => (
            <li key={r.token}><BoardRow row={r} rank={i + 1} nowSec={Math.floor(nowMs / 1000)} /></li>
          ))}
        </ol>
      </div>
    );

  return (
    <section className="lp-board-page">
      <header className="lp-top">
        <h1 className="type-display text-ink">{LAUNCH.title}</h1>
        <div className="lp-head-actions">
          <PillLink href="/launch/meme" tone="accent" size="md" data-primary-action="">{LAUNCH.create.meme}</PillLink>
          <PillLink href="/launch/stablecoin" tone="ink" size="md">{LAUNCH.create.stablecoin}</PillLink>
        </div>
      </header>
      <Stats board={board} />
      <div className="lp-controls">
        <TextTabs value={sort} onChange={(v) => set({ sort: v })} label={LAUNCH.listLabel} tabs={(Object.keys(LAUNCH.tabs) as BoardSort[]).map((value) => ({ value, label: LAUNCH.tabs[value] }))} className="lp-board-tabs" />
        <label className="lp-test-switch">
          <span>{LAUNCH.test(board?.teamCount ?? 0)}</span>
          <Switch checked={includeTeam} onCheckedChange={(on: boolean) => set({ test: on })} aria-label={LAUNCH.test(board?.teamCount ?? 0)} />
        </label>
      </div>
      {body}
    </section>
  );
}
