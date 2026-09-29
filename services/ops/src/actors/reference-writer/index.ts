/**
 * The `reference-writer` actor (plan B.3.2, C.5.2 "guard-reference-writer", S15b): keeps StockReference fresh on its
 * network. Each pass reads the RedStone gateway's latest `redstone-primary-prod` packages once, and for every mirror
 * whose on-chain feed (`feedsOf`) has a newer spot signed by ≥ threshold configured signers, pushes it with
 * `pushRedStone` (verified on-chain by the S2 verifier's `verifySpot`); it also writes the keeper session flag from
 * RedStone's signed `NY_MARKET_NEXT_CHANGE_TIME` (`setSession`, KEEPER_ROLE). Pushes and the flag go in one Tempo
 * batch from the keeper key (`KEEPER_PRIVATE_KEY`), fee token pathUSD. A mirror without a signed source (NFLX) is
 * skipped and says so. DRY_RUN logs the batch and never signs. Opt-in: starts only when named in `OPS_ACTORS`.
 */
import { encodeFunctionData, type Hex, type PublicClient } from "viem";
import { deployments } from "@cwf/clients";
import { stockReferenceAbi } from "@cwf/clients/abis/StockReference";
import { NETWORKS } from "@cwf/core";
import { parseGatewayJson, redstoneLatestUrl } from "@cwf/core/prices/redstone";
import { SESSIONS } from "@cwf/core/stocks/guard";
import { tempoReadClient } from "@cwf/markets";
import { sendRootCalls } from "@cwf/markets/tx/send";
import type { OpsEnv, PassResult } from "../../runtime";
import { feedName, plan, type MirrorState } from "./plan";

export const REFERENCE_WRITER_EVERY_MS = 15_000;
const VERIFIER_ABI = [
  { type: "function", name: "signers", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
  { type: "function", name: "threshold", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;
const TICKERS = ["TSLA", "AMZN", "PLTR", "NFLX", "AMD"] as const;

interface Fragment { contracts: Record<string, { address: `0x${string}` }> }

function config(env: OpsEnv) {
  const byChain = deployments as unknown as Record<string, Record<string, Fragment>>;
  const chain = byChain[String(NETWORKS[env.network])];
  const ref = chain?.guard?.contracts.StockReference?.address;
  if (!chain || !ref) throw new Error(`no StockReference deployed on ${env.network}`);
  const mirrors = TICKERS.flatMap((t) => {
    const m = chain.stocks?.contracts[`Mirror${t}`]?.address;
    return m ? [{ ticker: t, mirror: m }] : [];
  });
  return { ref, mirrors };
}

export function referenceWriterPass(env: OpsEnv, fetchImpl: typeof fetch = fetch): () => Promise<PassResult> {
  const { ref, mirrors } = config(env);
  const client: PublicClient = tempoReadClient(env.network, env.tempoRpcUrl);
  const key = process.env.KEEPER_PRIVATE_KEY as Hex | undefined;
  const lastPushSec = new Map<string, number>();
  let lastCloseMs: number | null = null;
  let pendingCloseMs: number | null = null;
  let verifier: { signers: readonly string[]; threshold: number } | null = null;

  const read = <T>(functionName: string, args: readonly unknown[] = []) =>
    client.readContract({ address: ref, abi: stockReferenceAbi, functionName, args } as never) as Promise<T>;

  return async () => {
    if (!env.dryRun && !key) throw new Error("KEEPER_PRIVATE_KEY missing (the keeper role signs pushRedStone + setSession)");
    if (!verifier) {
      const at = await read<`0x${string}`>("redstone");
      const [signers, threshold] = await Promise.all([
        client.readContract({ address: at, abi: VERIFIER_ABI, functionName: "signers" }),
        client.readContract({ address: at, abi: VERIFIER_ABI, functionName: "threshold" }),
      ]);
      verifier = { signers, threshold: Number(threshold) };
    }
    const states: MirrorState[] = await Promise.all(
      mirrors.map(async (m) => {
        const [feed] = await read<readonly [`0x${string}`, `0x${string}`]>("feedsOf", [m.mirror]);
        const r = await read<{ observedAt: bigint }>("read", [m.mirror]);
        return { ...m, feed: feedName(feed), observedAtSec: Number(r.observedAt) };
      }),
    );
    const [session, untilSec] = await Promise.all([read<number>("keeperSession"), read<bigint>("keeperSessionUntil")]);
    const res = await fetchImpl(redstoneLatestUrl(), { signal: AbortSignal.timeout(20_000) });
    if (res.status !== 200) throw new Error(`RedStone gateway ${res.status}`);
    const all = parseGatewayJson(await res.text());

    const nowMs = Date.now();
    if (pendingCloseMs !== null && nowMs >= pendingCloseMs) [lastCloseMs, pendingCloseMs] = [pendingCloseMs, null];
    const p = plan({ nowMs, all, mirrors: states, threshold: verifier.threshold, signers: verifier.signers, lastPushSec, onchainSession: { session: Number(session), untilSec: Number(untilSec) }, lastCloseMs });
    if (p.session?.closeMs) pendingCloseMs = p.session.closeMs;

    const calls: { to: `0x${string}`; data: Hex }[] = [];
    if (p.pushes.length) {
      calls.push({ to: ref, data: encodeFunctionData({ abi: stockReferenceAbi, functionName: "pushRedStone", args: [p.pushes.map((x) => x.mirror), p.pushes.map((x) => x.payload)] }) });
    }
    if (p.sessionWrite && p.session) {
      const state = SESSIONS.indexOf(p.session.session);
      calls.push({ to: ref, data: encodeFunctionData({ abi: stockReferenceAbi, functionName: "setSession", args: [state, BigInt(Math.floor(p.session.validUntilMs / 1000))] }) });
    }
    const what = [
      ...p.pushes.map((x) => `${x.ticker} ${Number(x.medianE8) / 1e8}@${x.tSec}`),
      ...(p.sessionWrite && p.session ? [`session ${p.session.session} until ${new Date(p.session.validUntilMs).toISOString()}`] : []),
    ];
    const detail = { pushes: p.pushes.length, skipped: p.skipped, session: p.session?.session ?? null };
    if (!calls.length) return { why: `up to date${p.skipped.length ? ` (${p.skipped.join("; ")})` : ""}`, detail };
    if (env.dryRun) return { why: `would send ${what.join(", ")}`, detail };
    const receipt = await sendRootCalls({ privateKey: key!, calls, network: env.network, rpcUrl: env.tempoRpcUrl });
    if (receipt.status !== "success") throw new Error(`batch reverted: ${receipt.transactionHash}`);
    const nowSec = Math.floor(nowMs / 1000);
    for (const x of p.pushes) lastPushSec.set(x.mirror, nowSec);
    return { why: `sent ${what.join(", ")} tx ${receipt.transactionHash} gas ${receipt.gasUsed}`, detail: { ...detail, tx: receipt.transactionHash } };
  };
}
