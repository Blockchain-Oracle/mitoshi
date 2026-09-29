/** A key's status from its live state (pure; no chain code, so pages can import it without viem/tempo, §3.1). */
import type { KeyState } from "./live";

export type KeyStatus = "active" | "revoked" | "expired" | "unknown";

export function keyStatus(key: KeyState, nowSec: bigint): KeyStatus {
  if (!key.live) return key.revoked ? "revoked" : "unknown";
  if (key.live.revoked || key.revoked) return "revoked";
  if (key.live.expirySec !== 0n && key.live.expirySec <= nowSec) return "expired";
  return "active";
}
