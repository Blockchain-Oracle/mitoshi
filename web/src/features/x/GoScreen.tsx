"use client";
// S11 (A-3e, D-227) — adapted from Owarine 90a91d71's Window share link (`share-link.ts`, the Blink's external link):
// `/go/t/<symbol>/<cadence>` and `/go/w/<marketId>` set the terminal's stake, pick the side and open the terminal on
// that lane or Window. Nothing is placed: the person opening the link signs the order themselves.
import { goTerminalHref, isMarketId, readGoTarget, readGoTrade, toMarketId, USD_DECIMALS, X_CADENCES } from "@cwf/core";
import { useMarket } from "@cwf/markets/react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { pillButtonVariants } from "@/components/kit/PillButton";
import { setTradeSettings } from "@/features/terminal/settings";
import { GO } from "./copy";
import "./x.css";

export function GoScreen() {
  const params = useParams<{ symbol?: string; cadence?: string; marketId?: string }>();
  const query = useSearchParams();
  const router = useRouter();
  const get = (name: string) => query.get(name);
  const trade = params.symbol && params.cadence ? readGoTrade(params.symbol, params.cadence, get, USD_DECIMALS) : null;
  const raw = params.marketId?.toLowerCase() ?? null;
  const marketId = raw && isMarketId(raw) ? toMarketId(raw) : null;
  const market = useMarket(marketId);
  const asset = market?.ok && market.value ? market.value.asset : null;
  const target = marketId ? readGoTarget(get, USD_DECIMALS) : trade;
  const href = trade ? goTerminalHref(trade.symbol, { lane: trade.lane, cadenceSec: X_CADENCES[trade.cadence] }, trade.side) : marketId && asset ? goTerminalHref(asset as never, { marketId }, target?.side ?? null) : null;
  const unknown = (!trade && !marketId) || (marketId !== null && market?.ok === true && market.value === null);

  useEffect(() => {
    if (!href) return;
    if (target?.stakeBase) setTradeSettings({ sizeBase: target.stakeBase.toString() });
    router.replace(href);
  }, [href, target?.stakeBase, router]);

  if (!unknown) return <section className="xt"><p className="xt-note" role="status">{GO.title}</p></section>;
  return (
    <section className="xt">
      <p className="xt-note">{GO.unknown}</p>
      <Link href="/markets" className={pillButtonVariants({ tone: "ink", size: "md" })}>{GO.markets}</Link>
    </section>
  );
}
