/**
 * Spike X4 (S16c.1, plan B.4.3): what does the 5-token theme agent key cost to authorize, can `follow` see a key
 * authorized earlier in the same tx, and how many root signatures (passkey prompts) does each shape need?
 * Throwaway roots (funded with `tempo_fundAddress`) authorize a key with the exact B.4.3 restrictions over the five
 * Moderato mirrors; the "router" is the X4Probe (`test/spikes/X4Probe.sol`), whose `check` reads the key like `follow`.
 *
 *   A  one tx, root batch  [keychain.authorizeKey(full), probe.check]              — 1 root signature
 *   B  one tx, tx-level key_authorization + [probe.check] (viem, @cwf/markets)      — 2 root signatures
 *   C  split: tx1 [authorizeKey(all limits; router + pathUSD scopes), probe.check],
 *             tx2 [setAllowedCalls(≤ 5 token scopes)]                                — 2 root signatures
 *   D  one tx, 1 token (scaling point)
 *   E  the key signs [pathUSD.approve(probe), probe.rebalance]; then approve(other) must be refused
 *
 *   tsx scripts/drive/x4-key-auth.ts <probe-address>
 * Wallet files go to $X4_DIR (default: a fresh tmp dir, 0600); private keys are never printed.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Address, type Hex, createPublicClient, decodeEventLog, encodeFunctionData, erc20Abi, getAddress, http, parseAbi } from "viem";
import { tempoModerato } from "viem/chains";
import { deployments } from "@cwf/clients";
import { type ThemeKeyParams, themeKeyAuthorizeCall, themeKeyAuthorization, themeKeyScopes, themeKeySetAllowedCallsChunks } from "@cwf/markets/themes";
import { sendRootWithKeyAuthorization } from "@cwf/markets/tx/send";
import { PATH_USD, castBatch } from "../lib/cast";

const RPC = process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
const probe = getAddress(process.argv[2] ?? "");
const client = createPublicClient({ chain: tempoModerato, transport: http(RPC) });
const dir = process.env.X4_DIR ?? mkdtempSync(join(tmpdir(), "x4-"));
const stocks = deployments[42431].stocks.contracts;
const MIRRORS = (["TSLA", "AMZN", "PLTR", "AMD", "NFLX"] as const).map((t) => getAddress(stocks[`Mirror${t}`].address));
const probeAbi = parseAbi([
  "function check(address keyId)",
  "function rebalance(uint64,(address,address,uint128,uint128)[],bytes,bytes32)",
  "event Seen(address indexed account, address indexed keyId, uint64 expiry, bool enforceLimits, bool isScoped, uint256 scopes, address txKey)",
  "event Rebalanced(address indexed account, address txKey)",
]);

function wallet(name: string): { file: string; address: Address; key: Hex } {
  const file = join(dir, `${name}.json`);
  writeFileSync(file, execFileSync("cast", ["wallet", "new", "--json"]).toString());
  chmodSync(file, 0o600);
  const d = (JSON.parse(readFileSync(file, "utf8")) as { data: { address: Address; private_key: Hex }[] }).data[0]!;
  return { file, address: getAddress(d.address), key: d.private_key };
}

async function fund(a: Address) {
  execFileSync("cast", ["rpc", "tempo_fundAddress", a, "--rpc-url", RPC], { stdio: "ignore" });
  for (let i = 0; i < 30; i++) {
    if ((await client.readContract({ address: PATH_USD, abi: erc20Abi, functionName: "balanceOf", args: [a] })) > 0n) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`funding ${a} did not land`);
}

const params = (keyId: Address, tokens: readonly Address[]): ThemeKeyParams => ({
  keyId,
  router: probe,
  tokens,
  expirySec: Math.floor(Date.now() / 1000) + 30 * 86_400,
  pathUsdDailyLimit: 1_050_000_000n, // $1,000 maxDailyUsd + $50 fee headroom
  tokenDailyLimits: tokens.map(() => 5_000_000n), // ceil(1000 / P × 1.2) at P ≈ $240 → 5 shares
});
const check = (keyId: Address) => ({ to: probe, data: encodeFunctionData({ abi: probeAbi, functionName: "check", args: [keyId] }) });

function seen(logs: readonly { address: Address; data: Hex; topics: readonly Hex[] }[]) {
  for (const l of logs) {
    if (l.address.toLowerCase() !== probe.toLowerCase()) continue;
    try {
      const e = decodeEventLog({ abi: probeAbi, data: l.data, topics: l.topics as never });
      if (e.eventName === "Seen") return e.args;
    } catch {}
  }
  return undefined;
}

const out: Record<string, unknown> = {};
const report = (name: string, r: { transactionHash: Hex; gasUsed: string | bigint; status: string; logs: never[] | readonly never[] }, signatures: number) => {
  const s = seen(r.logs as never);
  out[name] = { tx: r.transactionHash, gasUsed: BigInt(r.gasUsed).toString(), status: r.status, rootSignatures: signatures, followSawKey: s ? { scopes: s.scopes.toString(), isScoped: s.isScoped, enforceLimits: s.enforceLimits, txKey: s.txKey } : null };
  console.log(name, JSON.stringify(out[name]));
};

// A — one tx, authorizeKey as a batch call (1 root signature).
const rootA = wallet("rootA"), keyA = wallet("keyA");
await fund(rootA.address);
const pA = params(keyA.address, MIRRORS);
report("A_oneTx_batchCall_5tokens", castBatch([themeKeyAuthorizeCall(pA), check(keyA.address)], { signer: { walletFile: rootA.file }, extra: ["--gas-limit", "29000000"] }) as never, 1);

// B — tx-level key_authorization (root signs the authorization and the tx: 2 signatures).
const rootB = wallet("rootB"), keyB = wallet("keyB");
await fund(rootB.address);
const rB = await sendRootWithKeyAuthorization({ rootPrivateKey: rootB.key, keyId: keyB.address, authorization: themeKeyAuthorization(params(keyB.address, MIRRORS)), calls: [check(keyB.address)], rpcUrl: RPC, gas: 29_000_000n });
report("B_oneTx_keyAuthorizationField_5tokens", { ...rB, gasUsed: rB.gasUsed, status: rB.status, logs: rB.logs } as never, 2);

// C — split: tx1 all limits + router/pathUSD scopes + check, tx2 setAllowedCalls with the 5 token scopes.
const rootC = wallet("rootC"), keyC = wallet("keyC");
await fund(rootC.address);
const pC = params(keyC.address, MIRRORS);
const scopesC = themeKeyScopes(pC);
report("C1_split_authorize_router_pathUSD", castBatch([themeKeyAuthorizeCall(pC, scopesC.slice(0, 2)), check(keyC.address)], { signer: { walletFile: rootC.file }, extra: ["--gas-limit", "29000000"] }) as never, 1);
for (const [i, call] of themeKeySetAllowedCallsChunks(keyC.address, scopesC.slice(2)).entries()) {
  report(`C2_split_setAllowedCalls_chunk${i}`, castBatch([call, check(keyC.address)], { signer: { walletFile: rootC.file }, extra: ["--gas-limit", "29000000"] }) as never, 1);
}

// D — scaling point: 1 token.
const rootD = wallet("rootD"), keyD = wallet("keyD");
await fund(rootD.address);
report("D_oneTx_batchCall_1token", castBatch([themeKeyAuthorizeCall(params(keyD.address, MIRRORS.slice(0, 1))), check(keyD.address)], { signer: { walletFile: rootD.file }, extra: ["--gas-limit", "29000000"] }) as never, 1);

// E — the key itself: scoped approve + rebalance land (self-paid fee in pathUSD, which has a limit); an unscoped
// recipient is refused.
const approve = (spender: Address, amount: bigint) => ({ to: PATH_USD, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }) });
const rebalance = { to: probe, data: encodeFunctionData({ abi: probeAbi, functionName: "rebalance", args: [1n, [], "0x", `0x${"00".repeat(32)}`] }) };
const eOk = castBatch([approve(probe, 1_000_000n), rebalance], { signer: { accessKeyFile: keyA.file, root: rootA.address } });
out.E_keySigned_approve_rebalance = { tx: eOk.transactionHash, gasUsed: BigInt(eOk.gasUsed).toString(), status: eOk.status };
console.log("E_keySigned_approve_rebalance", JSON.stringify(out.E_keySigned_approve_rebalance));
try {
  castBatch([approve(getAddress("0x000000000000000000000000000000000000bEEF"), 1n)], { signer: { accessKeyFile: keyA.file, root: rootA.address } });
  throw new Error("an approve to a non-router spender landed — scope not enforced");
} catch (e) {
  const msg = (e as Error).message;
  if (msg.includes("scope not enforced")) throw e;
  out.E_keySigned_wrongSpender = { refused: true, error: msg.match(/CallNotAllowed|0x576b38b4|[A-Za-z]+Error[^\n]*/)?.[0] ?? msg.slice(0, 200) };
  console.log("E_keySigned_wrongSpender", JSON.stringify(out.E_keySigned_wrongSpender));
}
const [remaining] = await client.readContract({ address: "0xaAAAaaAA00000000000000000000000000000000", abi: parseAbi(["function getRemainingLimitWithPeriod(address,address,address) view returns (uint256,uint64)"]), functionName: "getRemainingLimitWithPeriod", args: [rootA.address, keyA.address, PATH_USD] });
out.E_remainingPathUsdLimit = remaining.toString();
out.accounts = { rootA: rootA.address, keyA: keyA.address, rootB: rootB.address, keyB: keyB.address, rootC: rootC.address, keyC: keyC.address, rootD: rootD.address, keyD: keyD.address, probe };
console.log(JSON.stringify(out, null, 2));
