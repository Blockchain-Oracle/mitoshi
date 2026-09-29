/**
 * The production fee relay, run in-process for live drives (S4): the same `createRelayHandler` the web's `/api/relay`
 * builds (accounts 0.18.4 `Handler.relay` + our policy engine + budgets), with every registered policy, a memory
 * ledger and the testnet relay fee payer (`~/.config/cwf/testnet/relay-fee-payer.json`, read here, never printed).
 * Each request runs inside `relayContext` exactly as the route sets it; every verdict is kept for the drive's report.
 */
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createPublicClient, erc20Abi, http, type Address, type Hex } from "viem";
import { OPEN_POSTURE, TEMPO_RPC_HTTP, type RegionPosture } from "@cwf/core";
import { PATH_USD, tempoChain } from "@cwf/markets";
import { createMemoryLedger, createRelayHandler, DEFAULT_LIMITS, POLICIES, relayContext, type PolicyVerdict } from "@cwf/markets/server";

export interface VerdictLog {
  atSec: number;
  method: string;
  sender: Address | null;
  verdict: PolicyVerdict;
}

export interface LocalRelay {
  url: string;
  feePayer: Address;
  verdicts: VerdictLog[];
  ledger: ReturnType<typeof createMemoryLedger>;
  close(): Promise<void>;
}

export async function startLocalRelay(opts: { port?: number; rpcUrl?: string; region?: "open" | "restricted" } = {}): Promise<LocalRelay> {
  const rpcUrl = opts.rpcUrl ?? process.env.TEMPO_RPC_HTTP_URL ?? TEMPO_RPC_HTTP.testnet;
  const key = (JSON.parse(readFileSync(join(homedir(), ".config", "cwf", "testnet", "relay-fee-payer.json"), "utf8")) as { privateKey: Hex }).privateKey;
  const chain = tempoChain("testnet");
  const reader = createPublicClient({ chain, transport: http(rpcUrl) });
  const ledger = createMemoryLedger();
  const verdicts: VerdictLog[] = [];
  const relay = createRelayHandler({
    chain,
    rpcUrl,
    feePayerPrivateKey: key,
    policies: POLICIES,
    ledger,
    limits: DEFAULT_LIMITS,
    path: "/api/relay",
    feePayerBalance: async () => reader.readContract({ address: PATH_USD, abi: erc20Abi, functionName: "balanceOf", args: [relayAddress] }).catch(() => null),
    onVerdict: (verdict, ctx, sender) => void verdicts.push({ atSec: ctx.nowSec, method: ctx.method, sender, verdict }),
  });
  const relayAddress = relay.feePayer;
  const region: RegionPosture = opts.region === "restricted" ? { ...OPEN_POSTURE, markets: "restricted" } : OPEN_POSTURE;
  const server: Server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const parsed = (() => {
      try {
        return JSON.parse(body.toString());
      } catch {
        return null;
      }
    })();
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    const method = typeof first?.method === "string" ? first.method : "unknown";
    const request = new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers: { "content-type": "application/json" }, body: req.method === "POST" ? body : undefined });
    const ctx = { method, device: "s4-drive", region, nowSec: Math.floor(Date.now() / 1000) };
    const response = await relayContext.run(ctx, () => relay.handler.fetch(request));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : opts.port;
  return { url: `http://127.0.0.1:${port}/api/relay`, feePayer: relayAddress, verdicts, ledger, close: () => new Promise((r) => server.close(() => r())) };
}
