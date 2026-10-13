"use client";
/**
 * The /portfolio/edge island (the /surface shape, §3.1, D-071): the report loads with the late data layer, which
 * carries the query client and the chain port; before that, a named wait.
 */
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";
import { EDGE } from "./copy";

function Placeholder() {
  return (
    <div className="mx-auto w-full max-w-(--content-wide) px-gutter py-8 lg:px-gutter-desktop">
      <LoadingState shape="page" label={EDGE.states.reading} />
    </div>
  );
}

const EdgeScreen = dynamic(() => import("./EdgeScreen").then((m) => m.EdgeScreen), { ssr: false, loading: () => <Placeholder /> });

export function EdgePage() {
  const ready = useDataReady();
  return ready ? <EdgeScreen /> : <Placeholder />;
}

/** The route's loading boundary draws this same placeholder, so a navigation swaps it once, in place (R4-13a, D-227). */
export { Placeholder as EdgeLoading };
