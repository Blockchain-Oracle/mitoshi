"use client";
// Ported from Owarine 90a91d71:web/src/features/markets/portfolio/plate/Pockets.tsx (P2, D-223; R4-4, D-227) — where else
// your money sits, as equal tiles: the Trading Balance and (where it exists) Private, each with its amount, one line and
// Manage. A pocket that can't be managed here says why instead (Owarine's `blockedReason`), never a sheet with nothing
// in it. Manage opens the kit sheet (`SlideOver` size lg: a bottom sheet on a phone, the right drawer on desktop,
// D-222); the last pocket opened stays in it while it animates closed (Owarine's `shown`), and the open one lives in the
// URL (`?d=pocket-trading` · `?d=pocket-private`, D-190): Back closes it. R6 money (D-230, round 7 "feel like an app"):
// under 640 px the pockets are one inset grouped list — a 64 px row each (mark, name over its line, amount, chevron),
// the iOS Wallet grammar — instead of two half tiles.
import { ChevronRight, LockKeyhole, Vault, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Masked } from "@/components/kit/Masked";
import { PillButton } from "@/components/kit/PillButton";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { money as usd } from "@/features/terminal/format";
import { closeDrawer, openDrawer, useOpenDrawerName } from "@/lib/drawer-param";
import { cn } from "@/lib/utils";
import { HERO_MONEY } from "../copy";
import type { PocketId, PocketMoney } from "./useMoney";
import "@/components/kit/kit.css";

const URL_KEY: Record<PocketId, string> = { vault: "pocket-trading", private: "pocket-private" };

const META: Record<PocketId, { icon: LucideIcon; label: string; note: string }> = {
  vault: { icon: Vault, ...HERO_MONEY.pockets.vault },
  private: { icon: LockKeyhole, ...HERO_MONEY.pockets.private },
};

/** `children`: tiles that are their own island (R4-7's Earn pocket, a link to /earn) — they sit in the same grid. */
export function Pockets({ pockets, decimals, panels, children }: { pockets: PocketMoney[]; decimals: number; panels: Record<PocketId, ReactNode>; children?: ReactNode }) {
  const named = useOpenDrawerName();
  const tiles = pockets.length + (children ? 1 : 0);
  const open = pockets.find((p) => URL_KEY[p.id] === named && p.blockedReason === null) ?? null;
  // The last pocket opened stays in the sheet while it animates closed, so its title and body never blank out.
  // Opened from the URL too (Back, Forward, a shared link), not only by Manage: whatever is open is what stays shown.
  const [shown, setShown] = useState<PocketId | null>(null);
  if (open && open.id !== shown) setShown(open.id);
  const current = open?.id ?? shown;
  const manage = (id: PocketId) => {
    setShown(id);
    openDrawer(URL_KEY[id]);
  };
  const amount = (p: PocketMoney) => (p.amountBase === null ? HERO_MONEY.pending : <Masked>{usd(p.amountBase, false, decimals)}</Masked>);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="pockets-title">
      <h2 id="pockets-title" className="type-title text-ink">{HERO_MONEY.pocketsTitle}</h2>
      <div className={cn("pockets-grid", tiles === 1 && "is-single", tiles === 3 && "is-triple")}>
        {pockets.map((p) => {
          const m = META[p.id];
          return (
            <div key={p.id} className="contents">
              <article className="pocket">
                <header className="flex items-center gap-3">
                  <span className="pocket-icon"><m.icon aria-hidden className="size-4" /></span>
                  <h3 className="min-w-0 flex-1 truncate type-body-strong text-ink">{m.label}</h3>
                </header>
                <p className="numbers pocket-amount">{amount(p)}</p>
                <p className={cn("pocket-note", p.blockedReason && "is-blocked")}>{p.blockedReason ?? m.note}</p>
                {p.blockedReason ? null : (
                  <PillButton tone="ink" size="sm" className="self-start" onClick={() => manage(p.id)}>{HERO_MONEY.manage}</PillButton>
                )}
              </article>
              <button type="button" className="pocket-chip" disabled={p.blockedReason !== null} aria-label={`${m.label} · ${HERO_MONEY.manage}`} onClick={() => manage(p.id)}>
                <span className="pocket-icon"><m.icon aria-hidden className="size-4" /></span>
                <span className="pocket-chip-body">
                  <span className="pocket-chip-label">{m.label}</span>
                  <span className="numbers pocket-chip-amount">{amount(p)}</span>
                  <span className="pocket-chip-why">{p.blockedReason ?? m.note}</span>
                </span>
                {p.blockedReason ? null : <ChevronRight aria-hidden className="pocket-chip-chev size-4 shrink-0 text-ink-secondary" />}
              </button>
            </div>
          );
        })}
        {children}
      </div>
      <SlideOver open={open !== null} onOpenChange={(o) => !o && closeDrawer()}>
        <SlideOverContent title={current ? META[current].label : HERO_MONEY.pocketsTitle} size="lg" fields>
          {current ? panels[current] : null}
        </SlideOverContent>
      </SlideOver>
    </section>
  );
}
