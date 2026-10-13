"use client";
/**
 * The /portfolio/edge island (the /surface shape, §3.1, D-071): the report loads with the late data layer, which
 * carries the query client and the chain port; before that, the page's own outline. R6 money (T10): `exemplar` is the
 * public record shown signed out (undefined while the server read streams in, null when there is none to show).
 */
import dynamic from "next/dynamic";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { table as tableShape } from "@/components/states/shapes/pages";
import { useDataReady } from "@/providers/data/context";
import { EDGE } from "./copy";
import type { Exemplar } from "./exemplar";

function Placeholder() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="type-display text-ink">{EDGE.intro.title}</h1>
        <p className="type-body text-ink-secondary">{EDGE.intro.lede}</p>
      </header>
      <LoadingFrame shape="table" label={EDGE.intro.eyebrow}>{tableShape()}</LoadingFrame>
    </div>
  );
}

const EdgeScreen = dynamic(() => import("./EdgeScreen").then((m) => m.EdgeScreen), { ssr: false, loading: () => <Placeholder /> });

export function EdgePage({ exemplar }: { exemplar?: Exemplar | null }) {
  const ready = useDataReady();
  return ready ? <EdgeScreen exemplar={exemplar} /> : <Placeholder />;
}

/** The route's loading boundary draws this same placeholder, so a navigation swaps it once, in place (R4-13a, D-227). */
export { Placeholder as EdgeLoading };
