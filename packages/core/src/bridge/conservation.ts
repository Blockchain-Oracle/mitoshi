/**
 * Reserves: is every bridged stock backed? (S14w `/reserves`; the 14c.11 invariant; D-227 R4-12.) All amounts in the
 * OFT's 6 shared decimals, so a Robinhood lockbox (18 dp) and a Tempo mirror (6 dp) compare directly.
 *
 * The lockbox counts what it locked toward the mesh (`outstanding`) and what an unlock could not deliver (`owed`); the
 * mesh holds that value as the mirror's supply, the adapter's deferred credits, the Base transit supply (a hop mid-way)
 * and messages still in flight. So `locked ≥ outstanding + owed` (covered; donations make it larger) and
 * `outstanding = supply + deferred + transit + inFlight` with `inFlight ≥ 0` (accounted). On Tempo alone two more hold
 * today: only the adapter mints (`supply == mintedNet`, and the issuer role is the adapter's alone) and supply ≤ cap.
 * A check that needs a chain we could not read is `unavailable` — never passed by assumption.
 */
import type { Address } from "../types/primitives";

export interface LockboxReads {
  locked: bigint;
  outstanding: bigint;
  owed: bigint;
}

export interface ReserveReads {
  /** Null while the Robinhood lockbox is not deployed (or could not be read). */
  lockbox: LockboxReads | null;
  /** Base Sepolia TransitOFT supply (the testnet hop); 0 on mainnet (no hop), null when unread or not deployed. */
  transitSupply: bigint | null;
  supply: bigint;
  supplyCap: bigint;
  /** `adapter.totalDeferred()`. */
  deferred: bigint;
  /** `adapter.mintedNet()`: minted minus burned through the adapter. */
  mintedNet: bigint;
  adapter: Address;
  /** Every current `ISSUER_ROLE` holder on the mirror (from its role events); null when not scanned. */
  issuers: readonly Address[] | null;
}

export type ReserveCheckId = "covered" | "accounted" | "minted" | "issuer" | "cap";
export type CheckStatus = "pass" | "fail" | "unavailable";

export interface ReserveCheck {
  id: ReserveCheckId;
  status: CheckStatus;
}

export interface Conservation {
  locked: bigint | null;
  outstanding: bigint | null;
  owed: bigint | null;
  onTempo: bigint;
  deferred: bigint;
  inTransit: bigint | null;
  /** outstanding − supply − deferred − transit: value between chains right now; null without the lockbox. */
  inFlight: bigint | null;
  /** locked − outstanding − owed (donations); null without the lockbox. */
  surplus: bigint | null;
  checks: ReserveCheck[];
  /** Every check that could run passed; null when none could. */
  ok: boolean | null;
}

const lower = (a: string) => a.toLowerCase();

export function conservation(r: ReserveReads): Conservation {
  const lb = r.lockbox;
  const transit = r.transitSupply;
  const inFlight = lb && transit !== null ? lb.outstanding - r.supply - r.deferred - transit : null;
  const surplus = lb ? lb.locked - lb.outstanding - lb.owed : null;
  const status = (known: boolean, pass: boolean): CheckStatus => (!known ? "unavailable" : pass ? "pass" : "fail");
  const issuersOk = r.issuers !== null && r.issuers.length === 1 && lower(r.issuers[0]!) === lower(r.adapter);
  const checks: ReserveCheck[] = [
    { id: "covered", status: status(lb !== null, surplus !== null && surplus >= 0n) },
    { id: "accounted", status: status(inFlight !== null, inFlight !== null && inFlight >= 0n) },
    { id: "minted", status: status(true, r.supply === r.mintedNet) },
    { id: "issuer", status: status(r.issuers !== null, issuersOk) },
    { id: "cap", status: status(true, r.supply <= r.supplyCap) },
  ];
  const ran = checks.filter((c) => c.status !== "unavailable");
  return {
    locked: lb?.locked ?? null,
    outstanding: lb?.outstanding ?? null,
    owed: lb?.owed ?? null,
    onTempo: r.supply,
    deferred: r.deferred,
    inTransit: transit,
    inFlight,
    surplus,
    checks,
    ok: ran.length === 0 ? null : ran.every((c) => c.status === "pass"),
  };
}

/** The page's one stamp: backed (every check ran and passed), short (any failed), partial (some could not run). */
export type ReserveVerdict = "backed" | "short" | "partial";

export function reserveVerdict(all: readonly Conservation[]): ReserveVerdict {
  const checks = all.flatMap((c) => c.checks);
  if (checks.some((c) => c.status === "fail")) return "short";
  return checks.length > 0 && checks.every((c) => c.status === "pass") ? "backed" : "partial";
}

export type PartitionPart = "onTempo" | "inFlight" | "held" | "surplus";

export interface PartitionSegment {
  part: PartitionPart;
  value: bigint;
}

/**
 * The ticker's bar: of what the lockbox holds — on Tempo, in flight (between chains, incl. a hop on Base), held
 * (owed on Robinhood + deferred on Tempo), surplus. Without the lockbox the bar spans what Tempo and Base can show.
 */
export function partitionOf(c: Conservation): PartitionSegment[] {
  const inFlight = (c.inFlight !== null && c.inFlight > 0n ? c.inFlight : 0n) + (c.inTransit ?? 0n);
  const held = c.deferred + (c.owed ?? 0n);
  const surplus = c.surplus !== null && c.surplus > 0n ? c.surplus : 0n;
  return [
    { part: "onTempo", value: c.onTempo },
    { part: "inFlight", value: inFlight },
    { part: "held", value: held },
    { part: "surplus", value: surplus },
  ];
}
