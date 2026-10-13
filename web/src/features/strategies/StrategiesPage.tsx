"use client";
/**
 * The /strategies island (the /leaderboard shape, §3.1, D-071): the desk loads with the late data layer, which carries the
 * query client and the submitter. The nameplate, the workspace pills and the not-advice line stand from the first paint
 * (StrategiesHead, Owarine's server-rendered head); only the body is a placeholder, shaped like the view it stands in for
 * — the studio for Create, the portrait cards for Copy and Yours — and the screen's own reading state draws the same
 * cards, so one placeholder is replaced in place (R4-6 gap 16, D-227). `?view=` is read once after mount, here, so the
 * pills work before the island lands; `?strategy=` and `?copy=` choose the view here and their target in the screen.
 */
import dynamic from "next/dynamic";
import { createContext, useContext, useEffect, useState } from "react";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";
import { STRATEGIES } from "./copy";
import { StrategiesHead, type StrategiesView } from "./StrategiesHead";

const ViewContext = createContext<StrategiesView>("create");

function Placeholder({ view }: { view: StrategiesView }) {
  return <LoadingState shape={view === "create" ? "studio" : "strategy-grid"} label={STRATEGIES.loading} />;
}
/** next/dynamic's `loading` gets no props; it renders where the screen will, so it reads the view from context. */
function IslandPlaceholder() {
  return <Placeholder view={useContext(ViewContext)} />;
}
const StrategiesScreen = dynamic(() => import("./StrategiesScreen").then((m) => m.StrategiesScreen), { ssr: false, loading: () => <IslandPlaceholder /> });

function viewOfQuery(q: URLSearchParams): StrategiesView | null {
  const v = q.get("view");
  if (q.get("copy")) return "create";
  if (v === "copy" || v === "yours" || v === "create") return v;
  return q.get("strategy") ? "copy" : null;
}

export function StrategiesPage() {
  const ready = useDataReady();
  const [view, setView] = useState<StrategiesView>("create");
  useEffect(() => {
    const v = viewOfQuery(new URLSearchParams(window.location.search));
    if (v) setView(v);
  }, []);
  return (
    <div className="flex flex-col gap-6">
      <StrategiesHead view={view} onView={setView} />
      <ViewContext.Provider value={view}>
        {ready ? <StrategiesScreen view={view} onView={setView} /> : <Placeholder view={view} />}
      </ViewContext.Provider>
      <p className="strat-advice">{STRATEGIES.advice}</p>
    </div>
  );
}
