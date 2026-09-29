/**
 * Binds the write lanes to ONE account (Masayume 68f7a09:packages/markets/src/submitter/create.ts). A submitter only
 * exists because a session exists, and a session only exists for a signer already bound, so `hasSigner` is true by
 * construction. The order lane (engine IOC, `order-lane.ts`) joins in S4 with the engine; until then an order is
 * refused as "not deployed" rather than faked.
 */
import type { Account, Chain, Transport, WalletClient } from "viem";
import { diagnosis, type Address, type IntentJournal, type Submitter } from "@cwf/core";
import type { Enqueue } from "../sessions/nonce-queue";
import { createMemoryJournal } from "./journal-memory";
import type { IntentEncoder } from "./encoders";
import { submitTx } from "./tx-lane";
import type { NoncePlan } from "../tx/nonce";

export interface SubmitterDeps {
  client: WalletClient<Transport, Chain, Account>;
  wallet: Address;
  enqueue: Enqueue;
  canSponsor: boolean;
  nowSec: () => number;
  journal?: IntentJournal;
  encoders?: readonly IntentEncoder[];
  nonce?: NoncePlan;
}

export interface MarketsSubmitter extends Submitter {
  readonly journal: IntentJournal;
  readonly wallet: Address;
}

export function createSubmitter(deps: SubmitterDeps): MarketsSubmitter {
  const journal = deps.journal ?? createMemoryJournal();
  // Expiring nonces never collide, so they need no queue (X21); ordered protocol nonces are serialised.
  const run = <T>(task: () => Promise<T>) => (deps.nonce?.kind === "protocol" ? deps.enqueue(task) : task());
  return {
    journal,
    wallet: deps.wallet,
    hasSigner: () => true,
    submitTx: (intent, onPhase) =>
      run(() => submitTx({ journal, client: deps.client, wallet: deps.wallet, canSponsor: deps.canSponsor, nowSec: deps.nowSec, encoders: deps.encoders, nonce: deps.nonce }, intent, onPhase)),
    submitOrder: async () => ({ status: "refused", diagnosis: diagnosis("not-deployed", "the market engine is not deployed on this network yet") }),
  };
}
