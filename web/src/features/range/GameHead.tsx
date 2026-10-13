"use client";
/**
 * A house game's head (R4-5, D-227; Owarine 90a91d71:web/src/features/range/RangeScreen.tsx's hero, cut to one 40 px
 * row): the title, a chip that opens your rounds in a sheet ("Rounds · n", or the accent "Claim $X" while one is won),
 * and ⓘ — how it pays in three lines plus the reserve's figures. No eyebrow and no description, so the controls start
 * at the top of a phone. Shared by Range, Moonshot and Parlay; Back closes either sheet (`urlKey`, D-190).
 */
import { Info } from "lucide-react";
import { useState, type ReactNode } from "react";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { RANGE } from "./copy";

/**
 * R6 games S06: on a game route (Range, Moonshot) the strip owns the title and the ? — the head is the Rounds chip alone
 * (no `title`, no `how`), placed at the cadence row's right end; Parlay, not a game route, keeps both.
 */
export function GameHead({ title, chip, chipAccent = false, sheetTitle, sheet, infoTitle, how, facts }: { title?: string; chip: string; chipAccent?: boolean; sheetTitle: string; sheet: ReactNode; infoTitle?: string; how?: readonly string[]; facts?: ReactNode }) {
  const [rounds, setRounds] = useState(false);
  const [info, setInfo] = useState(false);
  return (
    <header className={cn("gh", !title && "gh--chip")}>
      {title ? <h1 className="gh-title">{title}</h1> : null}
      <button type="button" className={cn("gh-chip numbers", chipAccent && "is-accent")} onClick={() => setRounds(true)} aria-haspopup="dialog">
        {chip}
      </button>
      {how ? (
        <button type="button" className="gh-info" onClick={() => setInfo(true)} aria-haspopup="dialog" aria-label={RANGE.info.open} title={RANGE.info.open}>
          <Info aria-hidden className="size-4" />
        </button>
      ) : null}
      <SlideOver open={rounds} onOpenChange={setRounds} urlKey="rounds">
        <SlideOverContent title={sheetTitle}>{sheet}</SlideOverContent>
      </SlideOver>
      {how ? (
        <SlideOver open={info} onOpenChange={setInfo} urlKey="how">
          <SlideOverContent title={infoTitle ?? ""}>
            <ol className="gh-how">
              {how.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
            {facts ? <div className="gh-facts">{facts}</div> : null}
          </SlideOverContent>
        </SlideOver>
      ) : null}
    </header>
  );
}
