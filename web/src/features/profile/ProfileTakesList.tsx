"use client";
// The profile's takes (R4-10, D-227; Owarine 90a91d71 `ProfileScreen`'s 04 Takes), live on the stream — an island of
// ProfileLive, so the route's first load carries none of the social stream.
import { LoadingState } from "@/components/states";
import { EmptyState } from "@/components/states/EmptyState";
import { TakeCard } from "@/features/social/TakesPanel";
import { useTakes } from "@/features/social/useTakes";
import { PROFILE as P } from "./copy";

export function ProfileTakesList({ address }: { address: string }) {
  const takes = useTakes({ author: address });
  const S = P.sections.takes;
  return (
    <>
      {takes.state === "ready" && takes.takes.length === 0 ? <EmptyState size="inline" why={S.empty} nextAction={{ label: S.write, href: "/trade/BTC?d=trade-room" }} /> : null}
      {takes.state === "loading" && takes.takes.length === 0 ? <LoadingState shape="row" /> : null}
      <ol className="divide-y divide-hairline">
        {takes.takes.map((t) => (
          <TakeCard key={t.id} t={t} me={takes.signedIn} onReact={(k, on) => void takes.react(t.id, k, on)} onDismiss={() => takes.dismiss(t.id)} onReport={() => undefined} onBlock={() => undefined} />
        ))}
      </ol>
    </>
  );
}
