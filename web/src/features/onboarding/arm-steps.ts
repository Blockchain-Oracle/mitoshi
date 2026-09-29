/**
 * The ceremony's arm slot (D-046): after funding, the same modal offers what makes the next taps prompt-free. Each
 * entry is registered by the stage that deploys its target — S4 adds the wallet access key once the engine exists,
 * S7 the Trading Balance arm once EventVault does. Until then the list is empty and the slot renders nothing (no
 * placeholder step that can't complete).
 */
import type { ReactNode } from "react";

export interface ArmStepProps {
  /** Called when the step finishes or the user skips it; the ceremony then lands on /markets. */
  onDone: () => void;
}

export interface ArmStep {
  id: string;
  /** False while the step's contract isn't deployed on this chain. */
  available: (chainId: number) => boolean;
  render: (props: ArmStepProps) => ReactNode;
}

export const ARM_STEPS: readonly ArmStep[] = [];

export function armStepsFor(chainId: number): readonly ArmStep[] {
  return ARM_STEPS.filter((s) => s.available(chainId));
}
