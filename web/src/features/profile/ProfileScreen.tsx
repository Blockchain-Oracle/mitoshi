// `/u/<address>` — a wallet's public record. Ported from Owarine 90a91d71:web/src/features/profile/ProfileScreen.tsx (R4-10,
// D-227): /news's frame — the eyebrow, the wallet's marble (the board's face for the same wallet) beside a mono title
// with an accent tail, the JP line, the bar (P&L, rank, tier, followers; Follow, Copy this trader, copy, explorer, …),
// then 01 Record (the rest of the figures, reputation, badges), 02 Open calls, 03 Settled (each opening its proof), 04
// Takes. Read on the server from the index (`readProfile`); a read that fails shows no figure.
import { addressUrl, type Address } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { connection } from "next/server";
import { SectionHeader } from "@/components/kit";
import { AccountAvatar } from "@/components/shell/header/AccountAvatar";
import { BadgeGrid, ReputationCard } from "@/features/edge/RecordBadges";
import { recordOf } from "@/features/edge/record";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { NewsRow } from "@/features/news/NewsRow";
import { money, moneyTone } from "@/features/terminal/format";
import { webEnv } from "@/lib/env";
import { people } from "@/server/social";
import { PROFILE as P } from "./copy";
import { readProfile, type Profile } from "./data";
import { ProfileBar, ProfileEyebrow, type BarStat } from "./ProfileBar";
import { ProfileOpen, ProfileTakes } from "./ProfileLive";
import "@/styles/news.css";
import "@/styles/news-wire.css";
import "./profile.css";

const when = (sec: number) => new Date(sec * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const roi = (bps: number | null) => (bps === null ? P.dash : `${bps > 0 ? "+" : bps < 0 ? "−" : ""}${Math.abs(bps / 100).toFixed(1)}%`);
const TONE = { win: "positive", loss: "negative", void: "neutral", closed: "neutral" } as const;

function Record({ p }: { p: Profile }) {
  const { reputation, badges } = recordOf({ wins: p.wins, losses: p.losses, currentWinStreak: p.currentStreak, fillCount: p.rounds, stakeBase: BigInt(p.stakeBase), decimals: 6 });
  const S = P.sections;
  const figures = [
    { label: P.stats.roi, value: roi(p.roiBps) },
    { label: P.stats.won, value: `${p.winRatePct}%` },
    { label: P.stats.rounds, value: p.rounds.toLocaleString("en-US") },
    { label: P.stats.streak, value: String(p.bestStreak) },
  ];
  return (
    <section className="prf-section" aria-label={S.record.title}>
      <SectionHeader index={S.record.index} title={S.record.title} />
      <dl className="prf-stats small">
        {figures.map((f) => (
          <div key={f.label} className="prf-stat">
            <dt>{f.label}</dt>
            <dd className="big numbers">{f.value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <ReputationCard reputation={reputation} />
        <BadgeGrid badges={badges} />
      </div>
    </section>
  );
}

function Settled({ p }: { p: Profile }) {
  const S = P.sections.settled;
  return (
    <section className="prf-section" aria-label={S.title}>
      <SectionHeader index={S.index} title={S.title} />
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
    </section>
  );
}

export async function ProfileScreen({ address }: { address: Address }) {
  await connection();
  const [p, named] = await Promise.all([readProfile(address).catch(() => null), people().profiles([address]).catch(() => new Map())]);
  const person = named.get(address.toLowerCase()) ?? null;
  const display: string | null = person?.displayName ?? null;
  const ranked = p && !p.house;
  const tier = ranked ? recordOf({ wins: p.wins, losses: p.losses, currentWinStreak: p.currentStreak, fillCount: p.rounds, stakeBase: BigInt(p.stakeBase), decimals: 6 }).reputation.tier : null;
  const pnl = ranked ? BigInt(p.pnlBase) : null;
  const stats: BarStat[] = ranked
    ? [
        { label: P.stats.pnl, value: money(pnl!, true), tone: moneyTone(pnl!) },
        { label: P.stats.rank, value: p.rank ? P.rank(p.rank, p.of) : P.dash },
        { label: P.stats.tier, value: tier ?? P.dash },
      ]
    : [];
  const tail = address.slice(-4);
  const head = `${address.slice(0, 6)}…`;
  return (
    <div className="container news-page prf-page">
      <div className="news-inner">
        <div className="news-live">
          <span className="news-live-dot" aria-hidden />
          <ProfileEyebrow address={address} />
        </div>
        <div className="prf-ident">
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
        </div>
        <div className="page-title-jp" lang="ja">{P.headingJp}</div>
        {person?.bio ? <p className="prf-bio">{person.bio}</p> : null}
        <ProfileBar address={address} stats={stats} explorerHref={addressUrl(address, webEnv.markets.network)} />

        {!p ? (
          <p className="prf-quiet prf-section">{P.unreadable}</p>
        ) : p.house ? (
          <p className="prf-quiet prf-section">{P.house}</p>
        ) : p.rounds === 0 ? (
          <p className="prf-quiet prf-section">{P.none}</p>
        ) : (
          <Record p={p} />
        )}
        {p && !p.house ? <ProfileOpen address={address} /> : null}
        {p && !p.house && p.recent.length > 0 ? <Settled p={p} /> : null}
        <ProfileTakes address={address} />
      </div>
    </div>
  );
}
