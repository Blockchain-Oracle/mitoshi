"use client";
// The ticker hub's 02 Calls — Ported from Owarine 90a91d71:web/src/features/activity/ActivityList.tsx (`showWho`) on
// Mitoshi's reads (R4-10, D-227): the ticker's newest fills from the index (read on the server, each side the wallet it
// counts for, as `/stats`) merged with its `$SYM` takes (`/api/social/takes?symbol=`, live on the stream), newest first,
// in the wire's row grammar: the wallet's marble in the mark slot, the side as the tone word.
import { formatBaseUnits, txUrl, USD_DECIMALS, type TickerSymbol } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import type { TractionCall } from "@cwf/db/idx";
import Link from "next/link";
import { AccountAvatar } from "@/components/shell/header/AccountAvatar";
import { timeAgo } from "@/features/news/copy";
import { NewsRow } from "@/features/news/NewsRow";
import type { Sentiment } from "@/features/news/wire";
import { useTakes } from "@/features/social/useTakes";
import { useClockValue } from "@/lib/clock";
import { webEnv } from "@/lib/env";
import { STOCKS } from "./copy";

const C = STOCKS.calls;
const LIMIT = 16;
const usd = (base: string) => `$${formatBaseUnits(BigInt(base), USD_DECIMALS, { maxDp: 2, minDp: 2 })}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

interface Row {
  key: string;
  atSec: number;
  wallet: string | null;
  name: string | null;
  title: string;
  href: string;
  external: boolean;
  tone: Sentiment;
  word: string;
}

/** Engine kinds: 0 BUY_YES (UP), 1 SELL_YES, 2 BUY_NO (DOWN), 3 SELL_NO. */
function fillRow(c: TractionCall, symbol: string): Row {
  const up = c.kind <= 1;
  const sold = c.kind === 1 || c.kind === 3;
  const side = up ? C.side.up : C.side.down;
  return {
    key: `f-${c.txHash}-${c.kind}-${c.wallet ?? ""}`,
    atSec: c.tsSec,
    wallet: c.wallet,
    name: null,
    title: `$${symbol} ${formatCadence(c.cadenceSec)} · ${sold ? `${C.word.sold} ${side}` : side} · ${usd(c.cashBase)}`,
    href: txUrl(c.txHash as `0x${string}`, webEnv.markets.network),
    external: true,
    tone: sold ? "neutral" : up ? "positive" : "negative",
    word: sold ? C.word.sold : C.word.fill,
  };
}

export function HubCalls({ symbol, calls }: { symbol: TickerSymbol; calls: TractionCall[] | null }) {
  const { takes, state } = useTakes({ symbol });
  const nowMs = useClockValue((ms) => Math.floor(ms / 60_000) * 60_000);
  const rows: Row[] = [
    ...(calls ?? []).map((c) => fillRow(c, symbol)),
    ...takes
      .filter((t) => !t.local)
      .map((t): Row => ({
        key: `t-${t.id}`,
        atSec: Math.floor(t.createdAtMs / 1000),
        wallet: t.author,
        name: t.name,
        title: `$${t.asset} ${formatCadence(t.intervalSec)} · ${t.side === "up" ? C.side.up : C.side.down} · ${t.caption}`,
        href: `/markets/${t.marketId}`,
        external: false,
        tone: t.side === "up" ? "positive" : "negative",
        word: C.word.take,
      })),
  ]
    .sort((a, b) => b.atSec - a.atSec)
    .slice(0, LIMIT);

  if (rows.length === 0) {
    const failed = calls === null && state === "error";
    const waiting = state === "loading" && calls === null;
    return <p className="stk-quiet" role="status" aria-busy={waiting}>{failed ? C.unreadable : C.empty}</p>;
  }
  return (
    <ol className="news-wire">
      {rows.map((r, i) => (
        <NewsRow
          key={r.key}
          index={i + 1}
          title={r.title}
          href={r.href}
          external={r.external}
          kind={r.word.toLowerCase()}
          mark={r.wallet ? <AccountAvatar seed={r.wallet} size={16} /> : null}
          meta={
            <span className="news-meta">
              {nowMs > 0 ? `${timeAgo(r.atSec, nowMs)} · ` : null}
              {r.wallet ? (
                <Link href={`/u/${r.wallet}`} className="stk-who">
                  {r.name ? `@${r.name}` : short(r.wallet)}
                </Link>
              ) : (
                C.product
              )}
            </span>
          }
          tone={r.tone}
          toneWord={r.word}
        />
      ))}
    </ol>
  );
}
