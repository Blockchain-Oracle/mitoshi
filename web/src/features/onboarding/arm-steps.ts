/**
 * The ceremony's arm slot (D-046): after funding, the same modal offers what makes the next taps prompt-free. Each
 * entry is registered by the stage that deploys its target — S4 adds the wallet access key once the engine exists,
 * S7 the Trading Balance arm once EventVault does. Until then the list is empty and the slot renders nothing (no
 * placeholder step that can't complete).
 */
import { createElement, type ReactNode } from "react";
import { ArmWalletKey } from "@/features/tap-trading/ArmWalletKey";
import { walletKeyTerms } from "@/providers/wallet/access-key";

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

/** S4: the wallet-mode access key (D-047) — offered once the engine is deployed on this chain. */
const WALLET_KEY_STEP: ArmStep = {
  id: "wallet-key",
  available: () => walletKeyTerms() !== null,
  render: ({ onDone }) => createElement(ArmWalletKey, { onDone }),
};

export const ARM_STEPS: readonly ArmStep[] = [WALLET_KEY_STEP];

export function armStepsFor(chainId: number): readonly ArmStep[] {
  return ARM_STEPS.filter((s) => s.available(chainId));
}
