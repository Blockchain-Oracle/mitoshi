/**
 * Head-fresh chain status is the only thing that may admit a write (canon #1; Masayume 68f7a09:packages/markets/src/
 * submitter/steps/status-gate.ts on the lens). The Window facts read here feed every later step, so the whole lane sees
 * one generation of the Window. A Listed Window admits only a pre-open PostOnly call (engine `PreOpenTakerRefused`).
 */
import { diagnosis, ONCHAIN_STATUS, type MarketId } from "@cwf/core";
import { readWindows, type WindowFacts } from "../engine/lens";
import { OrderRefusedError } from "./errors";

export async function statusGate(marketId: MarketId, allowListed = false): Promise<WindowFacts> {
  const facts = (await readWindows([marketId])).get(marketId);
  if (!facts) throw new OrderRefusedError(diagnosis("market-not-trading", `Window ${marketId} is not listed on the engine`, { errorName: "UnknownMarket" }));
  const ok = facts.status === ONCHAIN_STATUS.Trading || (allowListed && facts.status === ONCHAIN_STATUS.Listed);
  if (!ok) throw new OrderRefusedError(diagnosis("market-not-trading", `on-chain status ${facts.status} is not Trading (${ONCHAIN_STATUS.Trading})`));
  if (facts.status === ONCHAIN_STATUS.Trading && !facts.snapshot.prints.open) {
    // E-19 (Q-006): no taker fill before the opening print is recorded.
    throw new OrderRefusedError(diagnosis("market-not-trading", "waiting for the opening print", { errorName: "OpenPrintMissing" }));
  }
  return facts;
}
