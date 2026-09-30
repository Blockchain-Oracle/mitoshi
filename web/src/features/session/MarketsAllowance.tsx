"use client";
/**
 * The allowance pill on the markets screen (UX-06 "persistent"): on phones the header has no room for it, so it sits at
 * the top of the markets content while a Trading Balance grant exists — beside the calls it pays for — as well as on
 * the ticket and Portfolio (and in the desktop header). Loads only once there is a grant (§3.1).
 */
import dynamic from "next/dynamic";
import { useSessionView } from "./context";

const AllowancePill = dynamic(() => import("./AllowancePill").then((m) => m.AllowancePill), { ssr: false });

export function MarketsAllowance() {
  const view = useSessionView();
  if (!view.grant || view.status === "disarmed" || view.status === "loading") return null;
  return <AllowancePill className="mb-4" />;
}
