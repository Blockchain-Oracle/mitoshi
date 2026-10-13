// `/u/<address>` — a wallet's public record. Ported from Owarine 90a91d71:web/src/features/profile/ProfileScreen.tsx (R4-10,
// D-227): /news's frame — the eyebrow, the wallet's marble (the board's face for the same wallet) beside a mono title
// with an accent tail, the JP line. R6 money (S20 + T16, D-230): the ident row carries the one pair (Follow, Copy this
// trader) and "…"; then one stat row (P&L · ROI · Win rate · Rounds · Rank — 6835 user_xn1cklas/public-stats' anatomy),
// realised P&L over time (`ProfileCurve`, 29532), the badges with the tier in their head (the Record section and the
// reputation card are gone — the tier shows once), then 01 Open calls, 02 Settled (each opening its proof), 03 Takes,
// each empty one saying why with its next step. Read on the server from the index (`readProfile`); a read that fails
// shows no figure, only the error with Retry.
import { addressUrl, type Address } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { connection } from "next/server";
import { SectionHeader } from "@/components/shell/SectionHeader";
import { AccountAvatar } from "@/components/shell/header/AccountAvatar";
import { EmptyState } from "@/components/states/EmptyState";
import { BadgeGrid } from "@/features/markets/history/BadgeGrid";
import { recordOf } from "@/features/edge/record";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { NewsRow } from "@/features/news/NewsRow";
import { money, moneyTone } from "@/features/terminal/format";
import { webEnv } from "@/lib/env";
import { people } from "@/server/social";
import { PROFILE as P } from "./copy";
import { readProfile, type Profile } from "./data";
import { ProfileBar, ProfileEyebrow } from "./ProfileBar";
import { ProfileCurve } from "./ProfileCurve";
import { ProfileOpen, ProfileTakes } from "./ProfileLive";
import { ProfileRetry } from "./ProfileRetry";
import "@/styles/history.css";
import "@/styles/news.css";
import "@/styles/news-wire.css";
import "./profile.css";
import "@/components/kit/kit.css";

const when = (sec: number) => new Date(sec * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const roi = (bps: number | null) => (bps === null ? P.dash : `${bps > 0 ? "+" : bps < 0 ? "−" : ""}${Math.abs(bps / 100).toFixed(1)}%`);
const TONE = { win: "positive", loss: "negative", void: "neutral", closed: "neutral" } as const;

/** One row of figures: P&L leads (its own line on a phone), then ROI, win rate, rounds and rank. */
function Stats({ p }: { p: Profile | null }) {
  const any = p !== null && !p.house && p.rounds > 0;
  const pnl = any ? BigInt(p.pnlBase) : null;
  const rest = [
    { label: P.stats.roi, value: any ? roi(p.roiBps) : P.dash },
    { label: P.stats.winRate, value: any ? `${p.winRatePct}%` : P.dash },
    { label: P.stats.rounds, value: any ? p.rounds.toLocaleString("en-US") : P.dash },
    { label: P.stats.rank, value: any && p.rank ? P.rank(p.rank, p.of) : P.dash },
  ];
  return (
    <dl className="prf-stats">
      <div className="prf-stat prf-stat-lead">
        <dt>{P.stats.pnl}</dt>
        <dd className={`big numbers ${pnl === null ? "" : moneyTone(pnl)}`}>{pnl === null ? P.dash : money(pnl, true)}</dd>
      </div>
      {rest.map((s) => (
        <div key={s.label} className="prf-stat">
          <dt>{s.label}</dt>
          <dd className="big numbers">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Settled({ p }: { p: Profile }) {
  const S = P.sections.settled;
  return (
    <section className="prf-section" aria-label={S.title}>
      <SectionHeader index={S.index} title={S.title} />
      {p.recent.length === 0 ? (
        <EmptyState size="inline" why={S.empty} nextAction={{ label: P.makeCall, href: "/trade/BTC" }} />
      ) : (
        <ol className="news-wire">
          {p.recent.map((r, i) => {
            const v = BigInt(r.pnlBase);
            return (
              <NewsRow
                key={r.market}
                index={i + 1}
                title={`${r.symbol} ${formatCadence(r.cadenceSec)} · ${P.outcome[r.outcome]} · ${money(v, true)}`}
                href={`/proof/${r.market}`}
                external={false}
                mark={<AssetDisc asset={r.symbol} className="news-mark" />}
                meta={<span className="news-meta">{when(r.settledSec)}</span>}
                tone={TONE[r.outcome]}
                toneWord={P.outcome[r.outcome]}
              />
            );
          })}
        </ol>
      )}
    </section>
  );
}

export async function ProfileScreen({ address }: { address: Address }) {
  await connection();
  const [p, named] = await Promise.all([readProfile(address).catch(() => null), people().profiles([address]).catch(() => new Map())]);
  const person = named.get(address.toLowerCase()) ?? null;
  const display: string | null = person?.displayName ?? null;
  const ranked = p !== null && !p.house;
  const record = ranked ? recordOf({ wins: p.wins, losses: p.losses, currentWinStreak: p.currentStreak, fillCount: p.rounds, stakeBase: BigInt(p.stakeBase), decimals: 6 }) : null;
  const tail = address.slice(-4);
  const head = `${address.slice(0, 6)}…`;
  const ident = (
    <>
      <AccountAvatar seed={address} size={44} className="prf-avatar" />
      <h1 className="news-title prf-title">
        {display ? (
          <>
            @{display}
            <span className="prf-sub">{head}{tail}</span>
          </>
        ) : (
          <>
            {head}
            <span className="signal">{tail}</span>
          </>
        )}
      </h1>
    </>
  );
  return (
    <div className="container news-page prf-page">
      <div className="news-inner">
        <div className="news-live">
          <span className="news-live-dot" aria-hidden />
          <ProfileEyebrow address={address} />
        </div>
        <ProfileBar address={address} ident={ident} explorerHref={addressUrl(address, webEnv.markets.network)} />
        <div className="page-title-jp" lang="ja">{P.headingJp}</div>
        {person?.bio ? <p className="prf-bio">{person.bio}</p> : null}

        {!p ? (
          <ProfileRetry />
        ) : p.house ? (
          <p className="prf-quiet prf-section">{P.house}</p>
        ) : (
          <>
            <Stats p={p} />
            <ProfileCurve curve={p.curve} />
            {record ? <BadgeGrid badges={record.badges} reputation={record.reputation} /> : null}
          </>
        )}
        {ranked ? <ProfileOpen address={address} /> : null}
        {ranked ? <Settled p={p} /> : null}
        <ProfileTakes address={address} />
      </div>
    </div>
  );
}
