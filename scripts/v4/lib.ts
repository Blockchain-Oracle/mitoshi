/**
 * Shared pieces of the Uniswap v4 replay (docs/specs/v4-replay.md, plan D-021): the seven mainnet CREATE2 txs, the two
 * public clients, the root-key loader (never prints the key) and the Arachnid calldata split.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createPublicClient, getContractAddress, http, type Address, type Hex, slice } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { tempo, tempoModerato } from "viem/chains";
import { V4_REPLAY } from "@cwf/clients";

export const ARACHNID: Address = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
export const PATH_USD: Address = "0x20C0000000000000000000000000000000000000";

export interface ReplayRow { n: number; name: string; address: Address; mainnetTx: Hex; mainnetBlock: bigint; moderatoTx: Hex }

/** The seven rows of docs/specs/v4-replay.md, in replay order, with the Moderato replay txs (acceptance/S15.md). */
export const ROWS: readonly ReplayRow[] = V4_REPLAY.map((r, i) => ({ ...r, n: i + 1, mainnetBlock: BigInt(r.mainnetBlock) }));

export const mainnet = createPublicClient({ chain: tempo, transport: http(process.env.TEMPO_MAINNET_RPC_HTTP_URL ?? "https://rpc.tempo.xyz") });
export const moderato = createPublicClient({ chain: tempoModerato, transport: http(process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz") });

export interface CastReceipt { transactionHash: Hex; blockNumber: string; status: string; gasUsed: string; logs: { address: Address; topics: Hex[]; data: Hex }[] }

/**
 * Sends with `cast` as a testnet role (write-boundary: TS never signs outside `packages/markets/src/tx/send.ts`). The
 * key goes from the 0600 role file straight into the child process's argv — no shell, never logged. Always a Tempo tx
 * (0x76) paying fees in `feeToken` (default pathUSD). `calls` → one atomic `cast batch-send`; otherwise `cast send`.
 */
function cast(role: string, cmd: string[], opts: { rpc?: string; feeToken?: Address; extra?: string[] }): CastReceipt {
  const file = JSON.parse(readFileSync(join(homedir(), ".config", "cwf", "testnet", `${role}.json`), "utf8")) as { privateKey: Hex };
  const rpc = opts.rpc ?? process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
  const argv = [...cmd, "--rpc-url", rpc, "--private-key", file.privateKey, "--tempo.fee-token", opts.feeToken ?? PATH_USD, "--json", ...(opts.extra ?? [])];
  let out: string;
  try {
    out = execFileSync("cast", argv, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).toString();
  } catch (e) {
    const err = e as { stderr?: Buffer; stdout?: Buffer };
    throw new Error(`cast ${cmd[0]} failed: ${`${err.stderr?.toString() ?? ""}\n${err.stdout?.toString() ?? ""}`.replaceAll(file.privateKey, "<redacted>").trim()}`);
  }
  const parsed = JSON.parse(out.trim().split("\n").at(-1)!) as { data?: unknown };
  return (parsed.data ?? parsed) as CastReceipt;
}

export const castSend = (role: string, args: string[], opts: { rpc?: string; feeToken?: Address; extra?: string[] } = {}) => cast(role, ["send", ...args], opts);

export const castBatch = (role: string, calls: readonly { to: Address; data: Hex }[], opts: { rpc?: string; feeToken?: Address; extra?: string[] } = {}) =>
  cast(role, ["batch-send", ...calls.flatMap((c) => ["--call", `${c.to}::${c.data}`])], opts);

/** Loads a testnet role key from `~/.config/cwf/testnet/<role>.json` (0600). The key never leaves this process. */
export function loadRole(role: string): PrivateKeyAccount {
  const file = JSON.parse(readFileSync(join(homedir(), ".config", "cwf", "testnet", `${role}.json`), "utf8")) as { privateKey: Hex; address: Address };
  const account = privateKeyToAccount(file.privateKey);
  if (account.address.toLowerCase() !== file.address.toLowerCase()) throw new Error(`${role}: key does not match its address`);
  return account;
}

/** Arachnid calldata = salt (32 bytes) ‖ initcode(+args). Returns both halves and the CREATE2 address they imply. */
export function splitArachnid(input: Hex): { salt: Hex; initCode: Hex; predicted: Address } {
  const salt = slice(input, 0, 32);
  const initCode = slice(input, 32);
  const predicted = getContractAddress({ opcode: "CREATE2", from: ARACHNID, salt, bytecode: initCode });
  return { salt, initCode, predicted };
}

export const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
