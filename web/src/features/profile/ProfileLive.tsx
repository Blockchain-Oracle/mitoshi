"use client";
// The profile's live sections (R4-10, D-227; Owarine 90a91d71 `ProfileScreen`'s 03 Open calls and 04 Takes): the
// wallet's open calls on the terminal's value engine (`usePortfolioPositions`, the rows /portfolio shows, without the
// cash-out unless they are yours), once the data layer exists; and its takes, live on the stream.
import type { Address } from "@cwf/core";
import dynamic from "next/dynamic";
import { SectionHeader } from "@/components/shell/SectionHeader";
import { LoadingState } from "@/components/states";
import { TakeCard } from "@/features/social/TakesPanel";
import { useTakes } from "@/features/social/useTakes";
import { useDataReady } from "@/providers/data/context";
import { PROFILE as P } from "./copy";
import "@/components/kit/kit.css";

const OpenCalls = dynamic(() => import("./ProfileOpenCalls").then((m) => m.ProfileOpenCalls), { ssr: false, loading: () => <LoadingState shape="row" /> });

export function ProfileOpen({ address }: { address: Address }) {
  const ready = useDataReady();
  const S = P.sections.open;
  return (
    <section className="prf-section" aria-label={S.title}>
      <SectionHeader index={S.index} title={S.title} />
      {ready ? <OpenCalls address={address} /> : <LoadingState shape="row" />}
    </section>
  );
}

export function ProfileTakes({ address }: { address: string }) {
  const takes = useTakes({ author: address });
  const S = P.sections.takes;
  return (
    <section className="prf-section" aria-label={S.title}>
      <SectionHeader index={S.index} title={S.title} />
      {takes.state === "ready" && takes.takes.length === 0 ? <p className="prf-quiet">{S.empty}</p> : null}
      {takes.state === "loading" && takes.takes.length === 0 ? <LoadingState shape="row" /> : null}
      <ol className="divide-y divide-hairline">
        {takes.takes.map((t) => (
          <TakeCard key={t.id} t={t} me={takes.signedIn} onReact={(k, on) => void takes.react(t.id, k, on)} onDismiss={() => takes.dismiss(t.id)} onReport={() => undefined} onBlock={() => undefined} />
        ))}
      </ol>
    </section>
  );
}
