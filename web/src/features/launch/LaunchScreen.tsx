"use client";
// `/launch` (S17; R4-11, D-227): every launch the registry records, newest first, on the chain. Owarine has no launchpad,
// so the page is composed from its grammar — one head line with the two create pills (the accent one is the action),
// TextTabs as the filter (Ported from Owarine 90a91d71:web/src/components/kit/TextTabs.tsx) and market rows (LaunchRow,
// 21st 22252 + 23549). Never a sample launch: with none on chain the list says so under the two pills.
import { useLaunches } from "@cwf/markets/react";
import Link from "next/link";
import { useState } from "react";
import { pillButtonVariants, TextTabs } from "@/components/kit";
import { EmptyState } from "@/components/kit/desk-kit";
import { Rocket } from "lucide-react";
import { LAUNCH } from "./copy";
import { LaunchRow } from "./LaunchRow";
import "@/styles/launch.css";

type Tab = "all" | "meme" | "stable" | "graduated";

export function LaunchScreen() {
  const launches = useLaunches();
  const [tab, setTab] = useState<Tab>("all");
  const rows = launches?.ok ? launches.value : [];
  const shown = rows.filter((r) => (tab === "all" ? true : tab === "meme" ? r.kind === "memecoin" : tab === "stable" ? r.kind === "stablecoin" : r.meme?.stage === "graduated"));
  return (
    <section className="lp-page">
      <header className="lp-head">
        <div className="lp-head-text">
          <h1 className="type-display text-ink">{LAUNCH.title}</h1>
          <p className="type-body text-ink-secondary">{LAUNCH.line}</p>
        </div>
        <div className="lp-head-actions">
          <Link href="/launch/meme" className={pillButtonVariants({ tone: "accent", size: "md" })}>{LAUNCH.create.meme}</Link>
          <Link href="/launch/stablecoin" className={pillButtonVariants({ tone: "ink", size: "md" })}>{LAUNCH.create.stablecoin}</Link>
        </div>
      </header>
      <TextTabs value={tab} onChange={setTab} label={LAUNCH.listLabel} tabs={(Object.keys(LAUNCH.tabs) as Tab[]).map((value) => ({ value, label: LAUNCH.tabs[value] }))} />
      {launches === null ? (
        <p role="status" className="lp-note">{LAUNCH.reading}</p>
      ) : !launches.ok ? (
        <p role="alert" className="lp-note">{LAUNCH.failed}</p>
      ) : shown.length === 0 ? (
        <EmptyState icon={<Rocket aria-hidden />} title={rows.length === 0 ? LAUNCH.empty : LAUNCH.emptyTab} />
      ) : (
        <div className="lp-list" role="list" aria-label={LAUNCH.listLabel}>
          {shown.map((row) => (
            <div role="listitem" key={row.token}>
              <LaunchRow row={row} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
