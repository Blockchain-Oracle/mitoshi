/**
 * Verifies the Moderato v4 replay against Tempo mainnet (docs/specs/v4-replay.md) and writes the deployment fragment
 * `contracts/deployments/42431/v4.json`.
 *
 *   tsx scripts/v4/verify-replay.ts [--no-write]
 *
 * Checks, all of which must pass:
 *  1. Runtime code hashes are equal on both networks for PoolManager, the descriptor implementation and proxy, V4Quoter
 *     and StateView.
 *  2. PositionManager and UniversalRouter differ only in their EIP-712 immutables: the cached chain id (4217 ↔ 42431)
 *     and the cached domain separator, which is recomputed here from the domain fields and must match the embedded
 *     bytes and the value the contract returns. (The spec expected only PositionManager to differ; UR v2 is an OZ
 *     `EIP712("UniversalRouter", "2")` — finding S15a-F1.)
 *  3. Immutables and constructor state read back equal on both networks.
 *  4. Each Moderato replay tx has a successful receipt from Arachnid.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Address, type Hex, domainSeparator, keccak256, parseAbi, slice } from "viem";
import { ARACHNID, ROWS, mainnet, moderato, same } from "./lib";

type PublicClient = typeof moderato | typeof mainnet;

const CHAIN_MAIN = 4217;
const CHAIN_MOD = 42431;
const byName = Object.fromEntries(ROWS.map((r) => [r.name, r]));
const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
};

const bytes = (h: Hex) => Buffer.from(h.slice(2), "hex");

/** Masks every aligned occurrence of (mod, main) byte pairs in both buffers; returns the masked copies. */
function mask(mod: Buffer, main: Buffer, pairs: [Buffer, Buffer][]): [Buffer, Buffer, number] {
  const a = Buffer.from(mod);
  const b = Buffer.from(main);
  let masked = 0;
  for (const [x, y] of pairs) {
    for (let i = a.indexOf(x); i !== -1; i = a.indexOf(x, i + 1)) {
      if (b.subarray(i, i + y.length).equals(y)) {
        a.fill(0, i, i + x.length);
        b.fill(0, i, i + y.length);
        masked++;
      }
    }
  }
  return [a, b, masked];
}

/** The cached chain id immutable as it appears in the runtime: a 32-byte word (`PUSH32`). */
const chainWord = (id: number) => Buffer.from(id.toString(16).padStart(64, "0"), "hex");

async function eip712Only(name: string, domainOf: (c: PublicClient, chainId: number) => Promise<Hex>, onChain: (c: PublicClient) => Promise<Hex>) {
  const address = byName[name]!.address;
  const [codeMod, codeMain] = await Promise.all([moderato.getCode({ address }), mainnet.getCode({ address })]);
  const [dsMod, dsMain] = await Promise.all([domainOf(moderato, CHAIN_MOD), domainOf(mainnet, CHAIN_MAIN)]);
  const [liveMod, liveMain] = await Promise.all([onChain(moderato), onChain(mainnet)]);
  check(same(dsMod, liveMod) && same(dsMain, liveMain), `${name}: recomputed domain separators equal the live ones (${dsMod.slice(0, 10)}… / ${dsMain.slice(0, 10)}…)`);
  const [a, b, n] = mask(bytes(codeMod!), bytes(codeMain!), [[bytes(dsMod), bytes(dsMain)], [chainWord(CHAIN_MOD), chainWord(CHAIN_MAIN)]]);
  check(a.length === b.length && a.equals(b), `${name}: runtime equal after masking ${n} EIP-712 immutable(s) (chain id + domain separator)`);
}

const PM_ABI = parseAbi(["function owner() view returns (address)", "function protocolFeeController() view returns (address)"]);
const IMM_ABI = parseAbi([
  "function poolManager() view returns (address)",
  "function permit2() view returns (address)",
  "function WETH9() view returns (address)",
  "function tokenDescriptor() view returns (address)",
  "function unsubscribeGasLimit() view returns (uint256)",
  "function wrappedNative() view returns (address)",
  "function nativeCurrencyLabel() view returns (string)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function eip712Domain() view returns (bytes1, string, string, uint256, address, bytes32, uint256[])",
]);
const IMPL_SLOT: Hex = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ADMIN_SLOT: Hex = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

type Read = (c: PublicClient) => Promise<unknown>;
const call = (address: Address, abi: typeof IMM_ABI | typeof PM_ABI, functionName: string): Read => (c) =>
  c.readContract({ address, abi, functionName } as never);
const slotAddr = (address: Address, slot: Hex): Read => async (c) => `0x${((await c.getStorageAt({ address, slot })) ?? "0x").slice(-40)}`;

// 1. Identical code.
for (const name of ["PoolManager", "PositionDescriptorImplementation", "PositionDescriptor", "V4Quoter", "StateView"]) {
  const { address } = byName[name]!;
  const [a, b] = await Promise.all([moderato.getCode({ address }), mainnet.getCode({ address })]);
  check(!!a && a !== "0x" && keccak256(a) === keccak256(b!), `${name}: code hash ${a ? keccak256(a).slice(0, 18) : "none"}… equal on both networks`);
}

// 2. EIP-712-only differences.
const posm = byName.PositionManager!.address;
const ur = byName.UniversalRouter!.address;
await eip712Only(
  "PositionManager",
  async (_c, chainId) => domainSeparator({ domain: { name: "Uniswap v4 Positions NFT", chainId, verifyingContract: posm } }),
  (c) => c.readContract({ address: posm, abi: IMM_ABI, functionName: "DOMAIN_SEPARATOR" }),
);
await eip712Only(
  "UniversalRouter",
  async (c, chainId) => {
    const [, name, version, id, verifyingContract] = await c.readContract({ address: ur, abi: IMM_ABI, functionName: "eip712Domain" });
    if (Number(id) !== chainId) throw new Error(`UR eip712Domain chainId ${id} ≠ ${chainId}`);
    return domainSeparator({ domain: { name, version, chainId, verifyingContract } });
  },
  // UR has no DOMAIN_SEPARATOR getter; the live value is the recomputation from its own eip712Domain() fields.
  async (c) => {
    const [, name, version, id, verifyingContract] = await c.readContract({ address: ur, abi: IMM_ABI, functionName: "eip712Domain" });
    return domainSeparator({ domain: { name, version, chainId: Number(id), verifyingContract } });
  },
);

// 3. Immutables and constructor state.
const pm = byName.PoolManager!.address;
const desc = byName.PositionDescriptor!.address;
const reads: [string, Read][] = [
  ["PoolManager.protocolFeeController", call(pm, PM_ABI, "protocolFeeController")],
  ["PositionDescriptor.implementation (EIP-1967)", slotAddr(desc, IMPL_SLOT)],
  ["PositionDescriptor.admin (EIP-1967)", slotAddr(desc, ADMIN_SLOT)],
  ["PositionDescriptor.poolManager", call(desc, IMM_ABI, "poolManager")],
  ["PositionDescriptor.wrappedNative", call(desc, IMM_ABI, "wrappedNative")],
  ["PositionDescriptor.nativeCurrencyLabel", call(desc, IMM_ABI, "nativeCurrencyLabel")],
  ["PositionManager.poolManager", call(posm, IMM_ABI, "poolManager")],
  ["PositionManager.permit2", call(posm, IMM_ABI, "permit2")],
  ["PositionManager.WETH9", call(posm, IMM_ABI, "WETH9")],
  ["PositionManager.tokenDescriptor", call(posm, IMM_ABI, "tokenDescriptor")],
  ["PositionManager.unsubscribeGasLimit", call(posm, IMM_ABI, "unsubscribeGasLimit")],
  ["V4Quoter.poolManager", call(byName.V4Quoter!.address, IMM_ABI, "poolManager")],
  ["StateView.poolManager", call(byName.StateView!.address, IMM_ABI, "poolManager")],
  ["UniversalRouter.poolManager", call(ur, IMM_ABI, "poolManager")],
];
const immutables: Record<string, string> = {};
for (const [what, read] of reads) {
  const [a, b] = await Promise.all([read(moderato), read(mainnet)]);
  const [sa, sb] = [String(a), String(b)];
  immutables[what] = sa;
  check(sa.toLowerCase() === sb.toLowerCase(), `${what} = ${sa}`);
}
// PoolManager.owner: the constructor arg (Uniswap's deployer EOA) on Moderato; mainnet moved ownership to the Uniswap
// Wormhole receiver in block 9,901,235, so the two differ by history, not by code.
const pmInitOwner: Hex = slice((await mainnet.getTransaction({ hash: byName.PoolManager!.mainnetTx })).input as Hex, -20);
const [ownerMod, ownerMain] = await Promise.all([call(pm, PM_ABI, "owner")(moderato), call(pm, PM_ABI, "owner")(mainnet)]);
immutables["PoolManager.owner"] = String(ownerMod);
check(same(String(ownerMod), pmInitOwner), `PoolManager.owner on Moderato = constructor initialOwner ${pmInitOwner} (mainnet now ${ownerMain})`);
check(same(immutables["PositionDescriptor.implementation (EIP-1967)"]!, byName.PositionDescriptorImplementation!.address), "descriptor proxy points at the replayed implementation");
for (const k of ["PositionDescriptor.poolManager", "PositionManager.poolManager", "V4Quoter.poolManager", "StateView.poolManager", "UniversalRouter.poolManager"]) {
  check(same(immutables[k]!, pm), `${k} is the replayed PoolManager`);
}
check(same(immutables["PositionManager.tokenDescriptor"]!, desc), "PositionManager.tokenDescriptor is the replayed proxy");

// 4. Receipts.
const deployed: Record<string, { txHash: Hex; deployBlock: number }> = {};
for (const row of ROWS) {
  const r = await moderato.getTransactionReceipt({ hash: row.moderatoTx });
  check(r.status === "success" && !!r.to && same(r.to, ARACHNID), `#${row.n} ${row.name}: Moderato tx ${row.moderatoTx.slice(0, 12)}… block ${r.blockNumber} status ${r.status}`);
  deployed[row.name] = { txHash: row.moderatoTx, deployBlock: Number(r.blockNumber) };
}

if (failures.length) {
  console.error(`\nverify-replay: ${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nverify-replay: all checks pass");

if (!process.argv.includes("--no-write")) {
  const artifacts: Record<string, string> = {
    PoolManager: "IPoolManager.sol:IPoolManager",
    PositionDescriptorImplementation: "IPositionDescriptor.sol:IPositionDescriptor",
    PositionDescriptor: "IPositionDescriptor.sol:IPositionDescriptor",
    PositionManager: "IPositionManager.sol:IPositionManager",
    V4Quoter: "IV4Quoter.sol:IV4Quoter",
    StateView: "IStateView.sol:IStateView",
    UniversalRouter: "IUniversalRouter.sol:IUniversalRouter",
  };
  const contracts = Object.fromEntries(
    ROWS.map((r) => [r.name, { address: r.address, artifact: artifacts[r.name]!, profile: "default", proxy: r.name === "PositionDescriptor", ...deployed[r.name]!, history: [] }]),
  );
  const fragment = {
    schema: 1,
    chainId: CHAIN_MOD,
    area: "v4",
    commit: execSync("git rev-parse --short HEAD").toString().trim(),
    deployedAtUtc: new Date(Number((await moderato.getBlock({ blockNumber: BigInt(deployed.PoolManager!.deployBlock) })).timestamp) * 1000).toISOString(),
    deployer: (await moderato.getTransaction({ hash: ROWS[0]!.moderatoTx })).from,
    contracts,
    roles: { PoolManagerOwner: immutables["PoolManager.owner"] },
    params: { method: "replay of the Tempo mainnet CREATE2 txs through Arachnid (D-021)", verifiedAtUtc: new Date().toISOString() },
    external: {
      arachnid: ARACHNID,
      permit2: immutables["PositionManager.permit2"],
      weth9Placeholder: immutables["PositionManager.WETH9"],
      mainnetTxs: Object.fromEntries(ROWS.map((r) => [r.name, r.mainnetTx])),
      proxyAdmin: immutables["PositionDescriptor.admin (EIP-1967)"],
    },
  };
  const dir = join(import.meta.dirname, "..", "..", "contracts", "deployments", String(CHAIN_MOD));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "v4.json"), `${JSON.stringify(fragment, null, 2)}\n`);
  console.log(`verify-replay: wrote ${join(dir, "v4.json")}`);
}
