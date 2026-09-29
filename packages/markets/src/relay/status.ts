/** What `/api/relay/status` answers (plan C.3.3): fee payer, balance, breaker, allowlist, today's budget. */
import type { Address } from "viem";
import type { RelayArea } from "../submitter/encoders";

export interface RelayStatus {
  chainId: number;
  feePayer: Address;
  balanceMicros: string | null;
  breakerOpen: boolean;
  areas: { area: RelayArea; targets: Address[]; sponsor: string[]; never: string[] }[];
  today: { count: number; feeMicros: string; limitMicros: string };
  /** This process's latest policy verdicts, newest last: outcome and refusal code only (no senders). */
  recent: { atSec: number; method: string; ok: boolean; code: string | null }[];
  asOfSec: number;
}
