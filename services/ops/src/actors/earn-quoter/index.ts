/**
 * The earn-quoter (S8 box 2, plan C.5.2; Masayume 68f7a09:services/ops/src/actors/market-maker/index.ts's loop on
 * Mitoshi's engine): the S8 MarketMakerVault's maker. Each pass it settles the vault's closed Windows (permissionless,
 * pays the vault), then rests the vault's two-sided quote on every crypto Window that is Trading with its opening print
 * and enough time left, centred on the FairValueGuard's model at ops' latest signed spot (`decide.ts`). That depth is
 * what the Range, Moonshot and Parlay reserves price against (`ThinBook` without it), so it runs with the venue, not
 * from a script (F-S23-10). Signs with the `earn-quoter` key, which must be the vault's maker (`setMaker` from
 * `deployer-maker`, D-117); until it is, the pass settles and reports why it isn't quoting.
 */
import { encodeFunctionData, getAddress, type Address, type Hex } from "viem";
import { deployments } from "@cwf/clients";
import { engineLensAbi } from "@cwf/clients/abis/EngineLens";
import { fairValueGuardAbi } from "@cwf/clients/abis/FairValueGuard";
import { marketMakerVaultAbi } from "@cwf/clients/abis/MarketMakerVault";
import { TICKERS, TICKER_SYMBOLS } from "@cwf/core";
import { deploymentOf } from "@cwf/markets";
import { chainNowSec, createOpsClient, fetchMarkets, listSeries, marketIdOf, sendOps, venueOf } from "@cwf/markets/ops";
import { errorText, roleKey, runActor, type VenueDeps } from "../../runtime";
import { decideQuote, needsQuote, type LastQuote } from "./decide";

const EVERY_MS = 15_000;
const num = (name: string, fallback: number) => (Number.isFinite(Number(process.env[name])) && process.env[name] ? Number(process.env[name]) : fallback);

/** Crypto symbols (the vault quotes crypto Windows, its launch scope). */
const CRYPTO = new Set<string>(TICKER_SYMBOLS.filter((s) => TICKERS[s].kind === "crypto"));

type MarketRef = { status: number };

export function startEarnQuoter(deps: VenueDeps): { stop: () => void } {
  const env = {
    halfSpreadTicks: num("EARN_QUOTER_HALF_SPREAD_TICKS", 15),
    quantityContracts: num("EARN_QUOTER_QUANTITY", 20),
    minLeftSec: num("EARN_QUOTER_MIN_LEFT_SEC", 120),
    requoteTicks: num("EARN_QUOTER_REQUOTE_TICKS", 30),
    requoteSec: num("EARN_QUOTER_REQUOTE_SEC", 120),
  };
  const key = roleKey("earn-quoter", deps.env.network, process.env, deps.env.keysDir);
  const client = createOpsClient({ network: deps.env.network, rpcUrl: deps.env.tempoRpcUrl, privateKey: key, tier: 1 });
  const venue = venueOf(client.chainId);
  const vault = deploymentOf("maker", client.chainId)?.MarketMakerVault?.address ?? null;
  const guardAt = (deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }> }>>)[String(client.chainId)]?.fair?.contracts.FairValueGuard?.address;
  const guard = guardAt ? getAddress(guardAt) : null;
  const dryRun = deps.env.dryRun || !key;
  if (!key) deps.log("EARN_QUOTER_PRIVATE_KEY / earn-quoter.json missing: reading and reporting only");
  const last = new Map<Hex, LastQuote>();
  let txs = 0;

  const read = <T>(address: Address, abi: readonly unknown[], functionName: string, args: unknown[] = []) =>
    client.public.readContract({ address, abi: abi as never, functionName: functionName as never, args: args as never }) as Promise<T>;
  const send = async (data: Hex, why: string): Promise<string> => {
    if (dryRun) return `DRY ${why}`;
    const sent = await sendOps(client, [{ to: vault!, data }]);
    txs += 1;
    return `${why} · ${sent.hash}`;
  };

  return runActor({
    name: "earn-quoter",
    log: deps.log,
    dryRun,
    everyMs: EVERY_MS,
    pass: async () => {
      if (!venue || !vault || !guard) return { why: "no engine, maker vault or fair-value guard deployment on this chain" };
      const nowSec = await chainNowSec(client);
      const [maker, params, openWindows] = await Promise.all([
        read<Address>(vault, marketMakerVaultAbi, "maker"),
        read<readonly [number, bigint, bigint, bigint, bigint, bigint, number, number]>(vault, marketMakerVaultAbi, "params"),
        read<readonly Hex[]>(vault, marketMakerVaultAbi, "openWindows"),
      ]);
      const notes: string[] = [];
      // 1. Closed Windows first: settling frees their slots and books their result.
      for (const m of openWindows) {
        const ref = await read<MarketRef>(venue.lens, engineLensAbi, "marketRef", [m]);
        if (ref.status !== 4 && ref.status !== 5) continue;
        notes.push(await send(encodeFunctionData({ abi: marketMakerVaultAbi, functionName: "settle", args: [m] }), `settle ${m.slice(0, 10)}`).catch((e) => `settle ${m.slice(0, 10)} failed: ${errorText(e)}`));
        last.delete(m);
      }
      const isMaker = client.address !== null && maker.toLowerCase() === client.address.toLowerCase();
      if (!isMaker) return { why: `${notes.length} settled; not quoting: the vault's maker is ${maker}, not this key (${client.address ?? "none"}) — setMaker from deployer-maker (D-117)${notes.length ? ` | ${notes.join("; ")}` : ""}` };

      // 2. Live crypto Windows (each crypto Series' newest two, as the seed maker reads them): open, Trading, opening
      // print in, enough time left; soonest lock first.
      const [, minSpreadRaw, minPriceRaw, maxPriceRaw, maxQuantityRaw, , maxOpenWindows, minTimeLeftSec] = params;
      const series = (await listSeries(client, venue)).filter((x) => x.symbol !== null && CRYPTO.has(x.symbol));
      const refs = series.flatMap((x) => [1n, 2n].filter((k) => x.nextIndex >= k).map((k) => ({ symbol: x.symbol!, m: marketIdOf(x.seriesId, x.nextIndex - k) })));
      const views = await fetchMarkets(client, venue, refs.map((r) => r.m));
      const live: { m: Hex; lockAtSec: number; symbol: string }[] = [];
      refs.forEach((r, i) => {
        const v = views[i];
        if (!v || v.state !== 0 || v.tradingStartSec > nowSec || v.prints.open.source === 0) return;
        if (v.lockAtSec - nowSec < Math.max(env.minLeftSec, minTimeLeftSec)) return;
        live.push({ m: r.m, lockAtSec: v.lockAtSec, symbol: r.symbol });
      });
      live.sort((a, b) => a.lockAtSec - b.lockAtSec);
      const open = new Set(openWindows.map((m) => m.toLowerCase()));
      const quantity = BigInt(env.quantityContracts) * 1_000_000n > maxQuantityRaw ? maxQuantityRaw : BigInt(env.quantityContracts) * 1_000_000n;
      let quoted = 0;
      for (const { m, lockAtSec, symbol } of live) {
        if (!open.has(m.toLowerCase()) && open.size >= maxOpenWindows) {
          notes.push(`${symbol} ${m.slice(0, 10)}: the vault holds ${maxOpenWindows} Windows`);
          continue;
        }
        const spot = deps.spot?.latest(symbol as never, 30) ?? null;
        if (!spot) {
          notes.push(`${symbol}: no signed spot in 30 s`);
          continue;
        }
        const fairUpE6 = await read<bigint>(guard, fairValueGuardAbi, "previewFairUpE6", [m, spot.priceE8]);
        const [bids, asks] = await Promise.all([
          read<readonly [readonly number[], readonly bigint[]]>(venue.lens, engineLensAbi, "levels", [m, true, 1n, 0, 512n]),
          read<readonly [readonly number[], readonly bigint[]]>(venue.lens, engineLensAbi, "levels", [m, false, 1n, 0, 512n]),
        ]);
        const d = decideQuote({ fairUpE6, bestBidTicks: Number(bids[0][0] ?? 0), bestAskTicks: Number(asks[0][0] ?? 0), halfSpreadTicks: env.halfSpreadTicks, minSpreadTicks: Number(minSpreadRaw / 1000n), minTicks: Number(minPriceRaw / 1000n), maxTicks: Number(maxPriceRaw / 1000n) });
        if (d.kind === "skip") {
          notes.push(`${symbol} ${m.slice(0, 10)}: ${d.why}`);
          continue;
        }
        if (!needsQuote(last.get(m), d.midTicks, nowSec, env.requoteTicks, env.requoteSec)) continue;
        const data = encodeFunctionData({ abi: marketMakerVaultAbi, functionName: "quote", args: [m, BigInt(d.bidTicks) * 1000n, BigInt(d.askTicks) * 1000n, quantity, BigInt(lockAtSec) * 1_000_000_000n] });
        try {
          notes.push(await send(data, `${symbol} ${m.slice(0, 10)} ${d.bidTicks}/${d.askTicks} (model ${d.midTicks})`));
          last.set(m, { midTicks: d.midTicks, atSec: nowSec });
          open.add(m.toLowerCase());
          quoted += 1;
        } catch (e) {
          notes.push(`${symbol} ${m.slice(0, 10)} quote failed: ${errorText(e)}`);
        }
      }
      for (const m of [...last.keys()]) if (!live.some((w) => w.m === m)) last.delete(m);
      return { why: `${quoted} quoted of ${live.length} live crypto Windows · ${open.size}/${maxOpenWindows} held · ${txs} txs${dryRun ? " · DRY RUN" : ""}${notes.length ? ` | ${notes.slice(0, 10).join("; ")}` : ""}` };
    },
  });
}
