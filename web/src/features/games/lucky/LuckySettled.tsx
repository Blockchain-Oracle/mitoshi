"use client";

// The settle moment (R4-9, D-227; Owarine 90a91d71:web/src/features/games/lucky/LuckyStage.tsx's result modal, on
// Masayume 68f7a09's reconcile-on-read). A placed draw settles minutes later, on its Window's close: while one is open the
// machine re-reads the wallet's draws (the server reconciles each against the chain on that read), and the first time a
// draw comes back decided — won, lost, void or cashed out — the result opens once: the verdict, the draw, the streak on
// the Odometer, confetti on a win. Which draw was last shown lives in this browser only (`mitoshi.games.lucky.seen`); the
// first read on a browser marks the newest decided draw seen without opening, so an old result never pops up as news.
import type { Address } from "@cwf/core";
import { formatBaseUnits } from "@cwf/core/units";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Odometer } from "@/components/kit/Odometer";
import { ConfettiBurst } from "@/components/ui/confetti-burst";
import { SIDE_WORD } from "@/features/markets/side-styles";
import { gameKey } from "../keys";
import { LUCKY } from "./copy";
import { useLuckyHistory } from "./LuckyHistory";
import type { LuckyRowWire } from "./lucky-wire";
import "@/components/kit/kit.css";

const DECIDED = new Set(["won", "lost", "void", "cashed-out"]);
const OPEN = new Set(["placed", "pending", "unknown"]);
/** How often an open draw is re-read; each read is the server's reconcile against the chain. */
const WATCH_MS = 15_000;

function readSeen(): string | null {
  try {
    return globalThis.localStorage?.getItem(gameKey("lucky.seen")) ?? null;
  } catch {
    return null;
  }
}

function writeSeen(drawId: string) {
  try {
    globalThis.localStorage?.setItem(gameKey("lucky.seen"), drawId);
  } catch {
    // storage refused — the result may show again on the next visit, never a wrong one
  }
}

export function LuckySettled({ address, onAgain }: { address: Address; onAgain: () => void }) {
  const [watching, setWatching] = useState(false);
  const history = useLuckyHistory(address, watching ? WATCH_MS : false);
  const [shown, setShown] = useState<LuckyRowWire | null>(null);
  const rows = history.data?.rows;

  useEffect(() => {
    if (!rows) return;
    setWatching(rows.some((r) => OPEN.has(r.result)));
    const newest = rows.find((r) => DECIDED.has(r.result));
    if (!newest) return;
    const seen = readSeen();
    if (seen === newest.drawId) return;
    writeSeen(newest.drawId);
    // First read on this browser: the newest result is history, not news.
    if (seen === null) return;
    // Only a draw newer than the one last shown is news (rows are newest first).
    const seenAt = rows.findIndex((r) => r.drawId === seen);
    const at = rows.indexOf(newest);
    if (seenAt !== -1 && seenAt < at) return;
    setShown(newest);
  }, [rows]);

  const won = shown?.result === "won";
  const streak = history.data?.streak ?? 0;
  const best = history.data?.best ?? 0;
  const close = () => setShown(null);

  return (
    <Modal
      open={shown !== null}
      onOpenChange={(open) => (open ? undefined : close())}
      eyebrow={LUCKY.title}
      title={shown ? LUCKY.settled.verdict[shown.result as keyof typeof LUCKY.settled.verdict] ?? shown.result : ""}
      className="lk-settled"
      footer={
        <div className="lk-settled-actions">
          <button
            type="button"
            className="lk-cta"
            onClick={() => {
              close();
              onAgain();
            }}
            autoFocus
          >
            {LUCKY.again}
          </button>
          <Link href="/games/history" className="lk-settled-link" onClick={close}>
            {LUCKY.settled.history}
          </Link>
        </div>
      }
    >
      {shown ? (
        <div className="lk-settled-body" data-result={shown.result}>
          <ConfettiBurst fire={won} />
          <p className="lk-settled-draw">
            {[shown.asset, shown.side ? SIDE_WORD[shown.side] : null, shown.multiplier ? LUCKY.reels.multiple(shown.multiplier) : null].filter(Boolean).join(" · ")}
            {" · "}${formatBaseUnits(BigInt(shown.costBase ?? shown.stakeBase), 6, { minDp: 0 })}
          </p>
          <div className="lk-settled-streak" aria-label={LUCKY.streak(streak, best)}>
            <span className="lk-settled-label">{LUCKY.settled.streak}</span>
            <Odometer value={streak} kind="plain" className="lk-settled-figure" />
            <span className="lk-settled-label">{LUCKY.settled.best(best)}</span>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
