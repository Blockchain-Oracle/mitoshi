"use client";
/**
 * The ceremony's arm slot (D37, E.5 S7) when both prompt-free paths are on offer: one centred choice — tap from your
 * wallet (the S4 wallet key, D38b) or from a Trading Balance (the S7 session key, D38a) — on the adopted 21st 23552
 * segmented control, then that path's own one sentence and one button. A single path renders alone.
 */
import { useState, type ReactNode } from "react";
import { MotionScope } from "@/components/motion-scope";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SESSION } from "./copy";

export interface ArmChoice {
  id: string;
  label: string;
  node: ReactNode;
}

export function ArmSlot({ choices, initial }: { choices: readonly ArmChoice[]; initial?: string }) {
  const [chosen, setChosen] = useState(initial ?? choices[0]?.id ?? "");
  if (choices.length === 0) return null;
  if (choices.length === 1) return <>{choices[0]!.node}</>;
  const current = choices.find((c) => c.id === chosen) ?? choices[0]!;
  return (
    <div className="flex flex-col gap-3">
      <MotionScope>
        <SegmentedControl label={SESSION.chooser.label} value={current.id} onValueChange={setChosen} options={choices.map((c) => ({ value: c.id, label: c.label }))} />
      </MotionScope>
      {current.node}
    </div>
  );
}
