"use client";
// The legs as steps (R4-12, D-227; 21st 23569 via `components/ui/task-steps`): the route map's information for screen
// readers and the drawer — each leg sent, verified, delivered, held or waiting, with its LayerZero guid (copyable).
import { shortHex, type BridgeRoute, type LegRecord } from "@cwf/core";
import { TaskSteps, type TaskStep, type TaskStepStatus } from "@/components/ui/task-steps";
import { CopyButton } from "@/components/ui/copy-button";
import { BRIDGE } from "./copy";

function statusOf(l: LegRecord | undefined, active: boolean): TaskStepStatus {
  if (!l) return "pending";
  if (l.status === "delivered") return "done";
  if (l.status === "failed" || l.status === "deferred") return "error";
  return active ? "active" : "pending";
}

export function LegSteps({ route, legs, className }: { route: BridgeRoute; legs: readonly LegRecord[]; className?: string }) {
  const first = legs.findIndex((l) => l.status !== "delivered");
  const active = first === -1 ? legs.length : first;
  const steps: TaskStep[] = route.legs.map((plan, i) => {
    const l = legs[i];
    return {
      id: `${plan.srcEid}-${plan.dstEid}`,
      label: BRIDGE.track.leg(BRIDGE.chain[plan.from], BRIDGE.chain[plan.to]),
      status: statusOf(l, i === active),
      meta: l?.guid ? (
        <span className="brc-guid">
          <span className="numbers">{shortHex(l.guid, 6, 4)}</span>
          <CopyButton text={l.guid} label={BRIDGE.track.copyGuid} />
        </span>
      ) : undefined,
    };
  });
  return <TaskSteps steps={steps} label={BRIDGE.track.legs} className={className} />;
}
