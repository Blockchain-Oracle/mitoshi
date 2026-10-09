/**
 * A wallet's money moves for the terminal's Activity (RV-81; Tradash's "Account history", §8 "Money"): every pathUSD
 * `Transfer` from or to the account, read in ≤ 100k-block windows (Moderato's cap) from Mitoshi's first deployment on
 * the chain — nothing Mitoshi did predates it — and classified by counterparty:
 *
 *   the zero address (in)           the faucet's mint            → "faucet"
 *   a Trading Balance (any version)  in / out                     → "from-balance" / "to-balance"
 *   Earn's maker vault               in / out                     → "from-earn" / "to-earn"
 *   the fee manager                  the network fee (a refund in nets off) — folded into its transaction's row, or a
 *                                    "fee" row when nothing else moved in it
 *   any other Mitoshi contract       a trade, a payout or a claim: Trade history lists those, so the row is left out
 *   anyone else                      → "received" / "sent"
 *
 * Moderato's logs carry `blockTimestamp`, so a row needs no block read. The caller persists the scanned range.
 */
import { pad, toEventSelector, type Address, type Hex, type PublicClient } from "viem";
import { TEMPO } from "@cwf/clients";
import { AREAS, deploymentOf, deploymentsWithHistory } from "../deployments";
import { logWindows, withRetry } from "../keys/events";

export const TRANSFER_TOPIC = toEventSelector("event Transfer(address indexed from, address indexed to, uint256 amount)");

export interface TokenTransfer {
  blockNumber: bigint;
  logIndex: number;
  txHash: Hex;
  atSec: bigint | null;
  from: Address;
  to: Address;
  valueBase: bigint;
}

type RawLog = { blockNumber: string; logIndex: string; transactionHash: Hex; blockTimestamp?: string | null; topics: Hex[]; data: Hex };
const addr = (topic: Hex) => `0x${topic.slice(-40)}` as Address;

/** Scans [from, to] for `token` transfers from or to `account`. Throws if any window fails (the cursor must not skip a gap). */
export async function scanTransfers(client: PublicClient, token: Address, account: Address, from: bigint, to: bigint, concurrency = 8): Promise<TokenTransfer[]> {
  if (to < from) return [];
  const me = pad(account, { size: 32 });
  // Two filters a window: topics AND across positions, so "from me" and "to me" can't share one query.
  const jobs = logWindows(from, to).flatMap(([lo, hi]) => [[lo, hi, [TRANSFER_TOPIC, me]], [lo, hi, [TRANSFER_TOPIC, null, me]]] as const);
  const found = new Map<string, TokenTransfer>();
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const [lo, hi, topics] = jobs[next++]!;
      const logs = await withRetry(() =>
        client.request({ method: "eth_getLogs", params: [{ address: token, fromBlock: `0x${lo.toString(16)}`, toBlock: `0x${hi.toString(16)}`, topics }] } as never) as Promise<RawLog[]>,
      );
      for (const l of logs) {
        const t: TokenTransfer = {
          blockNumber: BigInt(l.blockNumber), logIndex: Number(l.logIndex), txHash: l.transactionHash,
          atSec: l.blockTimestamp ? BigInt(l.blockTimestamp) : null, from: addr(l.topics[1]!), to: addr(l.topics[2]!), valueBase: BigInt(l.data),
        };
        // A transfer to oneself is in both answers: keep it once.
        found.set(`${t.blockNumber}:${t.logIndex}`, t);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return [...found.values()].sort((x, y) => (x.blockNumber === y.blockNumber ? x.logIndex - y.logIndex : x.blockNumber < y.blockNumber ? -1 : 1));
}

/** Mitoshi's first deployment block on the chain: Activity reads no further back. Null when nothing is deployed there. */
export function activityFloorBlock(chainId: number): bigint | null {
  let floor: number | null = null;
  for (const area of AREAS) {
    for (const c of Object.values(deploymentOf(area, chainId) ?? {})) if (c.deployBlock !== null && (floor === null || c.deployBlock < floor)) floor = c.deployBlock;
  }
  return floor === null ? null : BigInt(floor);
}

export type ActivityKind = "faucet" | "received" | "sent" | "to-balance" | "from-balance" | "to-earn" | "from-earn" | "fee";

export interface ActivityRow {
  txHash: Hex;
  blockNumber: bigint;
  atSec: bigint | null;
  kind: ActivityKind;
  /** What moved (the fee for a "fee" row). */
  amountBase: bigint;
  /** The other side: an address for received / sent, the vault for balance and Earn moves, null for the faucet and fees. */
  counterparty: Address | null;
  /** The network fee paid in the same transaction (net of a refund), when this account paid it. */
  feeBase: bigint;
}

export interface Counterparties {
  balances: ReadonlySet<string>;
  earn: ReadonlySet<string>;
  /** Every other Mitoshi contract (trades, payouts, claims). */
  trading: ReadonlySet<string>;
  feeManager: string;
}

/** The chain's Mitoshi contracts, retired ones included (money can still move through them, D-213). */
export function counterpartiesOf(chainId: number): Counterparties {
  const lower = (xs: { address: Address }[]) => new Set(xs.map((x) => x.address.toLowerCase()));
  const balances = lower([...deploymentsWithHistory("vault", "EventVault", chainId), ...deploymentsWithHistory("vault2", "EventVaultV2", chainId)]);
  const earn = lower(deploymentsWithHistory("maker", "MarketMakerVault", chainId));
  const trading = new Set<string>();
  for (const area of AREAS) {
    for (const name of Object.keys(deploymentOf(area, chainId) ?? {})) {
      for (const d of deploymentsWithHistory(area, name, chainId)) {
        const a = d.address.toLowerCase();
        if (!balances.has(a) && !earn.has(a)) trading.add(a);
      }
    }
  }
  return { balances, earn, trading, feeManager: TEMPO.feeManager.toLowerCase() };
}

const ZERO = "0x0000000000000000000000000000000000000000";

/** The account's money moves, newest first: trades left to Trade history, fees folded into their transaction's row. */
export function activityRows(transfers: readonly TokenTransfer[], account: Address, cp: Counterparties): ActivityRow[] {
  const me = account.toLowerCase();
  const byTx = new Map<Hex, TokenTransfer[]>();
  for (const t of transfers) byTx.set(t.txHash, [...(byTx.get(t.txHash) ?? []), t]);
  const rows: ActivityRow[] = [];
  for (const [txHash, moves] of byTx) {
    const other = (t: TokenTransfer) => (t.from.toLowerCase() === me ? t.to : t.from).toLowerCase();
    let feeBase = 0n;
    for (const t of moves) {
      if (other(t) !== cp.feeManager) continue;
      feeBase += t.from.toLowerCase() === me ? t.valueBase : -t.valueBase;
    }
    if (feeBase < 0n) feeBase = 0n;
    const money = moves.filter((t) => other(t) !== cp.feeManager && t.from.toLowerCase() !== t.to.toLowerCase());
    if (money.some((t) => cp.trading.has(other(t)))) continue;
    const { blockNumber, atSec } = moves[0]!;
    if (money.length === 0) {
      if (feeBase > 0n) rows.push({ txHash, blockNumber, atSec, kind: "fee", amountBase: feeBase, counterparty: null, feeBase: 0n });
      continue;
    }
    money.forEach((t, i) => {
      const out = t.from.toLowerCase() === me;
      const o = other(t);
      const kind: ActivityKind =
        cp.balances.has(o) ? (out ? "to-balance" : "from-balance")
        : cp.earn.has(o) ? (out ? "to-earn" : "from-earn")
        : !out && o === ZERO ? "faucet"
        : out ? "sent" : "received";
      rows.push({ txHash, blockNumber, atSec, kind, amountBase: t.valueBase, counterparty: kind === "faucet" ? null : (out ? t.to : t.from), feeBase: i === 0 ? feeBase : 0n });
    });
  }
  return rows.sort((a, b) => (a.blockNumber === b.blockNumber ? 0 : a.blockNumber > b.blockNumber ? -1 : 1));
}
