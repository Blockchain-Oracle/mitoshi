"use client";
// Ported from Owarine 90a91d71:web/src/features/markets/portfolio/plate/Pockets.tsx (P2, D-223) — where else your money
// sits, as equal tiles: the Trading Balance and Private, each with its amount, one line and Manage, whose controls
// open in a wide sheet rather than a narrow column. The open pocket lives in the URL (`?d=pocket-trading` ·
// `?d=pocket-private`, D-190; R4-2, D-227): Back closes its sheet instead of leaving /portfolio.
import { formatBaseUnits } from "@cwf/core/units";
import { LockKeyhole, Vault, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import { closeDrawer, openDrawer, useOpenDrawerName } from "@/lib/drawer-param";
import { HERO_MONEY } from "../copy";

export interface Pocket {
  id: "vault" | "private";
  amountBase: bigint | null;
  panel: ReactNode;
}

const URL_KEY: Record<Pocket["id"], string> = { vault: "pocket-trading", private: "pocket-private" };

const META: Record<Pocket["id"], { icon: LucideIcon; label: string; note: string }> = {
  vault: { icon: Vault, ...HERO_MONEY.pockets.vault },
  private: { icon: LockKeyhole, ...HERO_MONEY.pockets.private },
};

export function Pockets({ pockets, decimals }: { pockets: Pocket[]; decimals: number }) {
  const named = useOpenDrawerName();
  const current = pockets.find((p) => URL_KEY[p.id] === named) ?? null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="pockets-title">
      <h2 id="pockets-title" className="type-title text-ink">{HERO_MONEY.pocketsTitle}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {pockets.map((p) => {
          const m = META[p.id];
          return (
            <article key={p.id} className="pocket">
              <header className="flex items-center gap-3">
                <span className="pocket-icon"><m.icon aria-hidden className="size-4" /></span>
                <h3 className="min-w-0 flex-1 truncate type-body-strong text-ink">{m.label}</h3>
              </header>
              <p className="numbers pocket-amount">{p.amountBase === null ? "—" : `$${formatBaseUnits(p.amountBase, decimals, { maxDp: 2, minDp: 2 })}`}</p>
              <p className="flex-1 type-caption text-ink-secondary">{m.note}</p>
              <button type="button" className="pocket-manage" onClick={() => openDrawer(URL_KEY[p.id])}>{HERO_MONEY.manage}</button>
            </article>
          );
        })}
      </div>
      <Modal open={current !== null} onOpenChange={(o) => !o && closeDrawer()} fields title={current ? META[current.id].label : HERO_MONEY.pocketsTitle}>
        {current?.panel}
      </Modal>
    </section>
  );
}
