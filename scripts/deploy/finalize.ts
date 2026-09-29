/**
 * Merges `contracts/deployments/<chainId>/<area>.pending.json` (written by `DeploymentWriter`) with the forge broadcast
 * receipts into the schema-v1 fragment `<area>.json` (plan C.1.6; contracts/deployments/README.md).
 *
 *   tsx scripts/deploy/finalize.ts <chainId> <area> <Script.s.sol>
 *
 * A contract whose address changed keeps its old address in `history[]`, so the indexer keeps reading retired
 * Moderato deployments. The pending file is deleted afterwards.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Hex = `0x${string}`;
interface PendingContract { address: Hex; artifact: string; profile: string; proxy: boolean }
interface Pending { schema: 1; chainId: number; area: string; deployer: Hex; params: Record<string, unknown>; roles: Record<string, Hex>; contracts: Record<string, PendingContract> }
interface HistoryEntry { address: Hex; deployBlock: number | null; retiredAtUtc: string }
interface FragmentContract extends PendingContract { deployBlock: number | null; txHash: Hex | null; history: HistoryEntry[] }
interface Fragment { schema: 1; chainId: number; area: string; commit: string; deployedAtUtc: string; deployer: Hex; contracts: Record<string, FragmentContract>; roles: Record<string, Hex>; params: Record<string, unknown>; external: Record<string, unknown> }
interface Broadcast { transactions: { hash: Hex; transactionType?: string; contractName?: string | null; contractAddress?: Hex | null; additionalContracts?: { address: Hex }[] }[]; receipts: { transactionHash: Hex; blockNumber: Hex | number }[] }

const [chainId, area, script] = process.argv.slice(2);
if (!chainId || !area || !script) throw new Error("usage: finalize.ts <chainId> <area> <Script.s.sol>");

const root = join(import.meta.dirname, "..", "..", "contracts");
const pendingPath = join(root, "deployments", chainId, `${area}.pending.json`);
const fragmentPath = join(root, "deployments", chainId, `${area}.json`);
const broadcastPath = join(root, "broadcast", script, chainId, "run-latest.json");
if (!existsSync(pendingPath)) throw new Error(`no pending file at ${pendingPath}`);
if (!existsSync(broadcastPath)) throw new Error(`no broadcast at ${broadcastPath} (did the script run with --broadcast?)`);

const pending = JSON.parse(readFileSync(pendingPath, "utf8")) as Pending;
const broadcast = JSON.parse(readFileSync(broadcastPath, "utf8")) as Broadcast;
const previous = existsSync(fragmentPath) ? (JSON.parse(readFileSync(fragmentPath, "utf8")) as Fragment) : null;
const now = new Date().toISOString();
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

function locate(address: Hex): { txHash: Hex | null; deployBlock: number | null } {
  // Only a creation locates a contract: a CALL's `contractAddress` is its target, not a deployment (S2.11).
  const creates = broadcast.transactions.filter((t) => t.transactionType === "CREATE" || t.transactionType === "CREATE2");
  const tx = creates.find((t) => same(t.contractAddress, address) || t.additionalContracts?.some((c) => same(c.address, address)));
  if (!tx) return { txHash: null, deployBlock: null };
  const receipt = broadcast.receipts.find((r) => same(r.transactionHash, tx.hash));
  return { txHash: tx.hash, deployBlock: receipt ? Number(receipt.blockNumber) : null };
}

// Linked libraries forge deployed for the script (CREATE2 through the deterministic deployer) are recorded too, so
// source verification and audits can find them.
for (const t of broadcast.transactions) {
  if (t.transactionType !== "CREATE2" || !t.contractName || !t.contractAddress || pending.contracts[t.contractName]) continue;
  pending.contracts[t.contractName] = { address: t.contractAddress, artifact: `${t.contractName}.sol:${t.contractName}`, profile: "default", proxy: false };
}

const contracts: Record<string, FragmentContract> = {};
for (const [name, c] of Object.entries(pending.contracts)) {
  const before = previous?.contracts[name];
  const history = [...(before?.history ?? [])];
  if (before && !same(before.address, c.address)) history.push({ address: before.address, deployBlock: before.deployBlock, retiredAtUtc: now });
  const located = locate(c.address);
  const unchanged = before && same(before.address, c.address);
  contracts[name] = { ...c, txHash: located.txHash ?? (unchanged ? before.txHash : null), deployBlock: located.deployBlock ?? (unchanged ? before.deployBlock : null), history };
}

const fragment: Fragment = {
  schema: 1,
  chainId: Number(chainId),
  area,
  commit: execSync("git rev-parse --short HEAD").toString().trim(),
  deployedAtUtc: now,
  deployer: pending.deployer,
  contracts: { ...(previous?.contracts ?? {}), ...contracts },
  roles: { ...(previous?.roles ?? {}), ...pending.roles },
  params: { ...(previous?.params ?? {}), ...pending.params },
  external: previous?.external ?? {},
};
writeFileSync(fragmentPath, `${JSON.stringify(fragment, null, 2)}\n`);
rmSync(pendingPath);
console.log(`finalize: wrote ${fragmentPath} (${Object.keys(contracts).length} contract(s)); run \`pnpm codegen\``);
