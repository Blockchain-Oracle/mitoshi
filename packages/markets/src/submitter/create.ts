/**
 * Binds the write lanes to ONE account (Masayume 68f7a09:packages/markets/src/submitter/create.ts). A submitter only
 * exists because a session exists, and a session only exists for a signer already bound, so `hasSigner` is true by
 * construction. Three lanes (AD-3): orders (`order-lane.ts`, engine IOC — or, routed through the Trading Balance,
 * `vault/order.ts`, S7), cash-outs (`cash-out.ts`, SELL IOC) and every other intent (`tx-lane.ts`). Expiring nonces
 * never collide, so taps run concurrently (X21); protocol nonces queue.
 */
import type { Account, Chain, Transport, WalletClient } from "viem";
import type { Address, AttributionHook, IntentJournal, StopGate, Submitter } from "@cwf/core";
import type { Enqueue } from "../sessions/nonce-queue";
import { createMemoryJournal } from "./journal-memory";
import type { IntentEncoder } from "./encoders";
import { submitTx } from "./tx-lane";
import { allowAllStopGate, noAttribution, submitOrder } from "./order-lane";
import { submitCashOut } from "./cash-out";
import { submitVaultOrder } from "../vault/order";
import { nowMs } from "../runtime/clock";
import type { NoncePlan } from "../tx/nonce";
import type { PendingKeyAuthorization } from "../tx/send";

export interface SubmitterDeps {
  client: WalletClient<Transport, Chain, Account>;
  wallet: Address;
  enqueue: Enqueue;
  canSponsor: boolean;
  nowSec: () => number;
  journal?: IntentJournal;
  encoders?: readonly IntentEncoder[];
  nonce?: NoncePlan;
  stopGate?: StopGate;
  pendingKeyAuthorization?: PendingKeyAuthorization;
  attribution?: AttributionHook;
  nowMs?: () => number;
}

export interface MarketsSubmitter extends Submitter {
  readonly journal: IntentJournal;
  readonly wallet: Address;
}

export function createSubmitter(deps: SubmitterDeps): MarketsSubmitter {
  const journal = deps.journal ?? createMemoryJournal();
  // Expiring nonces never collide, so they need no queue (X21); ordered protocol nonces are serialised.
  const run = <T>(task: () => Promise<T>) => (deps.nonce?.kind === "protocol" ? deps.enqueue(task) : task());
  const lane = {
    journal, client: deps.client, wallet: deps.wallet, canSponsor: deps.canSponsor, nowSec: deps.nowSec, nowMs: deps.nowMs ?? nowMs,
    ...(deps.nonce ? { nonce: deps.nonce } : {}),
    ...(deps.pendingKeyAuthorization ? { pendingKeyAuthorization: deps.pendingKeyAuthorization } : {}),
  };
  return {
    journal,
    wallet: deps.wallet,
    hasSigner: () => true,
    submitTx: (intent, onPhase) =>
      run(() => submitTx({ ...lane, encoders: deps.encoders }, intent, onPhase)),
    submitOrder: (request, onPhase) => {
      const ctx = { ...lane, stopGate: deps.stopGate ?? allowAllStopGate, attribution: deps.attribution ?? noAttribution };
      // AD-3's third dimension: a Trading Balance route rides the vault (S7); the wallet route the engine lane.
      const viaVault = request.route !== undefined && request.route.kind !== "wallet";
      return run(() => (viaVault ? submitVaultOrder(ctx, request, onPhase) : submitOrder(ctx, request, onPhase)));
    },
    submitCashOut: (request, onPhase) => run(() => submitCashOut(lane, request, onPhase)),
  };
}
