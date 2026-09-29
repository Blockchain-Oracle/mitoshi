/**
 * Write-path diagnosis: the one error map (AD-13), plus the engine's custom errors decoded from raw revert data — a
 * relay fill or a sync send surfaces an engine refusal as bare hex (`0x…` selector), which the browser-safe map can't
 * name without viem. The lanes load viem anyway, so they decode here.
 */
import { diagnosis, type Diagnosis } from "@cwf/core";
import { diagnose, revertKind } from "../errors/error-map";
import { engineErrorName } from "../ops/send";

export function diagnoseWrite(error: unknown): Diagnosis {
  const base = diagnose(error);
  if (base.errorName) return base;
  const name = engineErrorName(error);
  if (!name) return base;
  return diagnosis(revertKind(name) ?? "contract-revert", base.technical, { errorName: name });
}

/**
 * A send whose fate is unknown: a timeout, or a transport failure on the raw send itself (the gateway can accept a tx
 * and still answer 502). Such a write is journaled "unknown" and decided by its expiring window, never re-sent.
 */
export function isAmbiguousSend(error: unknown): boolean {
  let e: unknown = error;
  for (let depth = 0; depth < 10 && e && typeof e === "object"; depth++) {
    const x = e as { name?: string; body?: { method?: string }; message?: string };
    // tx/send already asked the chain by hash until the expiring window closed: definitely not included.
    if (x.name === "NotIncludedError") return false;
    if (x.name === "TimeoutError" || x.name === "WaitForTransactionReceiptTimeoutError") return true;
    if ((x.name === "HttpRequestError" || x.name === "SocketClosedError") && /sendRawTransaction/.test(x.body?.method ?? "")) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return /timed? ?out/i.test(error instanceof Error ? error.message : String(error));
}
