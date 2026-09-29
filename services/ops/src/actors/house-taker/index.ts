/**
 * house-taker (S3 soak; opt-in, never in the default set): the `keeper` key takes one small IOC against the seed
 * maker's best quote on a trading 24/7 Window every `HOUSE_TAKER_EVERY_SEC` (default 15 min), alternating sides, so an
 * unattended soak exercises fills, settlement and the settler's auto-pay (`redeemFor`) with real transactions. House
 * activity by our own testnet key: its address is an operator wallet, excluded from leaderboards and traction, and
 * every fill it makes is labelled as such in the heartbeat.
 */
import { erc20Abi, encodeFunctionData, maxUint256, type Address } from "viem";
import { TEMPO } from "@cwf/clients";
import { chainNowSec, createOpsClient, fetchMarkets, KIND, listSeries, marketIdOf, ORDER_TYPE, placeOrderCall, sendOps, topOfBook, venueOf } from "@cwf/markets/ops";
import { laneKey } from "@cwf/core";
import { errorText, roleKey, runActor, type VenueDeps } from "../../runtime";

export function startHouseTaker(deps: VenueDeps): { stop: () => void } {
  const key = roleKey("keeper", deps.env.network, process.env, deps.env.keysDir);
  const client = createOpsClient({ network: deps.env.network, rpcUrl: deps.env.tempoRpcUrl, privateKey: key });
  const venue = venueOf(client.chainId);
  if (!venue) throw new Error(`no engine fragment for chain ${client.chainId}`);
  const dryRun = deps.env.dryRun || !key;
  const everyMs = (Number(process.env.HOUSE_TAKER_EVERY_SEC) > 0 ? Number(process.env.HOUSE_TAKER_EVERY_SEC) : 900) * 1000;
  const lots = BigInt(Number(process.env.HOUSE_TAKER_LOTS) > 0 ? Number(process.env.HOUSE_TAKER_LOTS) : 1_000);
  const lanes = (process.env.HOUSE_TAKER_LANES ?? "BTC-5m,ETH-5m,SOL-5m").split(",").map((s) => s.trim());
  let n = 0;
  let recent: string[] = [];
  let approved = false;
  const pass = async () => {
    if (!dryRun && !approved && client.address) {
      const have = (await client.public.readContract({ address: TEMPO.pathUSD as Address, abi: erc20Abi, functionName: "allowance", args: [client.address, venue.engine] })) as bigint;
      if (have < 10n ** 12n) await sendOps(client, [{ to: TEMPO.pathUSD as Address, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [venue.engine, maxUint256 / 2n] }) }]);
      approved = true;
    }
    const lane = lanes[n++ % lanes.length]!;
    const series = (await listSeries(client, venue)).find((s) => s.symbol && s.lane && laneKey(s.symbol, s.lane, s.cadenceSec) === lane);
    if (!series || series.nextIndex === 0n) return { why: `${lane}: no Series or no Window yet` };
    const nowSec = await chainNowSec(client);
    const ids = [1n, 2n].filter((k) => series.nextIndex >= k).map((k) => marketIdOf(series.seriesId, series.nextIndex - k));
    const views = await fetchMarkets(client, venue, ids);
    const m = views.find((v) => v && v.state === 0 && v.tradingStartSec <= nowSec && nowSec < v.lockAtSec - 60 && v.prints.open.source !== 0);
    if (!m) return { why: `${lane}: no trading Window with an open print` };
    const top = await topOfBook(client, venue, m.marketId);
    const buyYes = n % 2 === 1 ? top.askTicks > 0 : top.bidTicks === 0;
    const price = buyYes ? top.askTicks : top.bidTicks;
    if (!price) return { why: `${lane} #${m.index}: empty book` };
    const what = `${lane} #${m.index} IOC ${buyYes ? "BUY_YES" : "BUY_NO"} ${lots} @ ${price}`;
    if (dryRun) return { why: `DRY ${what}` };
    try {
      const sent = await sendOps(client, [placeOrderCall(venue.engine, { market: m.marketId, kind: buyYes ? KIND.buyYes : KIND.buyNo, orderType: ORDER_TYPE.ioc, priceTicks: price, lots, expireTsSec: m.lockAtSec, clientId: BigInt(nowSec), useCredit: false })]);
      recent = [`${what} ${sent.hash}`, ...recent].slice(0, 20);
      return { why: `house fill: ${what} · ${sent.hash}`, detail: { recent } };
    } catch (error) {
      return { why: `${what} refused: ${errorText(error)}`, detail: { recent } };
    }
  };
  deps.log(`house-taker ${client.address ?? "(no key)"} every ${everyMs / 1000} s on ${lanes.join(",")} (house activity, operator wallet)`);
  return runActor({ name: "house-taker", log: deps.log, dryRun, everyMs, pass });
}
