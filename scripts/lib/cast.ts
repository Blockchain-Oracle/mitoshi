/**
 * Scripted Tempo sends through Foundry's `cast` (write-boundary: TS never signs outside
 * `packages/markets/src/tx/send.ts`). Keys go from their 0600 files straight into the child process's argv — no
 * shell, never logged, redacted from errors. Every send is a Tempo tx (0x76) paying fees in `feeToken` (default
 * pathUSD). `castBatch` → one atomic `cast batch-send`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Address, Hex } from "viem";

export const PATH_USD: Address = "0x20C0000000000000000000000000000000000000";

export interface CastReceipt { transactionHash: Hex; blockNumber: string; status: string; gasUsed: string; feeToken?: Address; logs: { address: Address; topics: Hex[]; data: Hex }[] }

/** A testnet role (`~/.config/cwf/testnet/<role>.json`), or an access key signing for its root account (TIP-1011). */
export type Signer = { role: string } | { accessKeyFile: string; root: Address };

export interface CastOptions { rpc?: string; feeToken?: Address; extra?: string[]; signer?: Signer }

function keyArgs(signer: Signer): { args: string[]; secret: string } {
  if ("role" in signer) {
    const file = JSON.parse(readFileSync(join(homedir(), ".config", "cwf", "testnet", `${signer.role}.json`), "utf8")) as { privateKey: Hex };
    return { args: ["--private-key", file.privateKey], secret: file.privateKey };
  }
  // A `cast wallet new --json` file.
  const file = JSON.parse(readFileSync(signer.accessKeyFile, "utf8")) as { data: { private_key: Hex }[] };
  const key = file.data[0]!.private_key;
  return { args: ["--tempo.access-key", key, "--tempo.root-account", signer.root], secret: key };
}

function cast(cmd: string[], opts: CastOptions): CastReceipt {
  const { args, secret } = keyArgs(opts.signer ?? { role: "deployer" });
  const rpc = opts.rpc ?? process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
  const argv = [...cmd, "--rpc-url", rpc, ...args, "--tempo.fee-token", opts.feeToken ?? PATH_USD, "--json", ...(opts.extra ?? [])];
  let out: string;
  try {
    out = execFileSync("cast", argv, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).toString();
  } catch (e) {
    const err = e as { stderr?: Buffer; stdout?: Buffer };
    throw new Error(`cast ${cmd[0]} failed: ${`${err.stderr?.toString() ?? ""}\n${err.stdout?.toString() ?? ""}`.replaceAll(secret, "<redacted>").trim()}`);
  }
  const parsed = JSON.parse(out.trim().split("\n").at(-1)!) as { data?: unknown };
  return (parsed.data ?? parsed) as CastReceipt;
}

export const castSend = (args: string[], opts: CastOptions = {}) => cast(["send", ...args], opts);

export const castBatch = (calls: readonly { to: Address; data: Hex }[], opts: CastOptions = {}) =>
  cast(["batch-send", ...calls.flatMap((c) => ["--call", `${c.to}::${c.data}`])], opts);
