/**
 * The `validate` hook `Handler.relay` calls (accounts 0.18.4 `feePayer.validate`): policy engine, then budgets, then
 * — on every method that co-signs (`SIGNING_METHODS`) — a ledger row. The request context (method, device, region) comes from the route through
 * `getContext`, because the handler itself is built once at module scope (D-055).
 */
import type { Address } from "viem";
import { checkGates, SIGNING_METHODS, type GateLimits } from "./gates";
import { evaluate, normalizeRequest, type EngineConfig } from "./engine";
import type { LedgerStore } from "./ledger";
import type { PolicyVerdict, RelayContext } from "./types";

export interface ValidatorDeps {
  engine: EngineConfig;
  ledger: LedgerStore;
  limits: GateLimits;
  getContext: () => RelayContext | undefined;
  /** The fee payer's pathUSD balance in micros (cached by the caller); null when unreadable. */
  feePayerBalance: () => Promise<bigint | null>;
  /** True when the sender has never sent a transaction (TIP-1000 account creation applies). */
  senderIsNew?: (sender: Address) => Promise<boolean>;
  onVerdict?: (verdict: PolicyVerdict, ctx: RelayContext, sender: Address | null) => void;
}

export function createRelayValidator(deps: ValidatorDeps) {
  return async function validate(raw: unknown): Promise<boolean> {
    const ctx = deps.getContext();
    if (!ctx) return false;
    let request;
    try {
      request = normalizeRequest((raw ?? {}) as Record<string, unknown>, deps.engine.chainId);
    } catch {
      deps.onVerdict?.({ ok: false, code: "malformed", reason: "unparseable request fields" }, ctx, null);
      return false;
    }
    // The balance read and the new-sender check start together (a tap's fill waits on this hook, D-150).
    const balance = deps.feePayerBalance();
    balance.catch(() => undefined);
    const isNew = request.from && deps.senderIsNew ? await deps.senderIsNew(request.from).catch(() => false) : false;
    let verdict = await evaluate(deps.engine, request, ctx, { isNew });
    if (verdict.ok && request.from) {
      const gate = await checkGates(deps.ledger, deps.limits, {
        sender: request.from, device: ctx.device, feeMicros: verdict.feeMicros, nowSec: ctx.nowSec, feePayerBalanceMicros: await balance.catch(() => null),
      });
      if (gate) verdict = gate;
    }
    deps.onVerdict?.(verdict, ctx, request.from);
    if (!verdict.ok || !request.from) return false;
    if (SIGNING_METHODS.has(ctx.method)) {
      await deps.ledger.record({
        chainId: request.chainId, area: verdict.area, sender: request.from, device: ctx.device, method: ctx.method,
        feeMicros: verdict.feeMicros, txHash: null, createdAtSec: ctx.nowSec,
      });
    }
    return true;
  };
}
