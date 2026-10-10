// `/u/<address>` — a wallet's public record (S5's profile component; S13 adds its calls, takes and follows): the 21st
// 781 header (initials on the address hue, the tier and its board place, the explorer), the figures the leaderboard
// ranks it by, its reputation and badges (Trader Edge's own components, `features/edge`), and its latest settled
// Windows, each opening its proof. Read on the server from the index (`readProfile`); a read that fails shows no
// figure.
import { addressUrl, type Address } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import Link from "next/link";
import { connection } from "next/server";
import { ProfileHeader } from "@/components/ui/profile-header";
import { ProfileSocial } from "@/features/social/ProfileSocial";
import { people } from "@/server/social";
import { BadgeGrid, ReputationCard } from "@/features/edge/RecordBadges";
import { recordOf } from "@/features/edge/record";
import { money, moneyTone } from "@/features/terminal/format";
import { webEnv } from "@/lib/env";
import { readProfile, type Profile } from "./data";

const W = {
  tierLine: (tier: string) => `${tier} tier`,
  place: (rank: number, of: number) => `#${rank} of ${of} on the all-time board`,
  unranked: "Not on the board yet",
  explorer: "View on the explorer",
  house: "This is one of Mitoshi's own keys (the house's maker, taker or a product contract). The house is never ranked, so it has no record here.",
  unreadable: "This record can't be read right now. Nothing changed; try again in a minute.",
  none: "No settled Windows yet. A record starts when a Window this wallet called settles.",
  figures: { pnl: "P&L, all time", roi: "Return on stake", winRate: "Won", rounds: "Settled rounds", streak: "Best run" },
  recent: "Latest settled Windows",
  outcome: { win: "Won", loss: "Lost", void: "Void · returned", closed: "Sold before the close" },
  proof: "Proof",
} as const;

const TONE = { "is-up": "text-up", "is-down": "text-down", "": "text-ink" } as const;
const when = (sec: number) => {
  const d = new Date(sec * 1000);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} ${d.toISOString().slice(11, 16)} UTC`;
};

function Figure({ label, value, tone = "" }: { label: string; value: string; tone?: keyof typeof TONE }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface-1 p-4">
      <span className="type-label-micro text-ink-secondary">{label}</span>
      <span className={`type-title tabular-nums ${TONE[tone]}`}>{value}</span>
    </div>
  );
}

function Record({ p }: { p: Profile }) {
  const pnl = BigInt(p.pnlBase);
  const { reputation, badges } = recordOf({ wins: p.wins, losses: p.losses, currentWinStreak: p.currentStreak, fillCount: p.rounds, stakeBase: BigInt(p.stakeBase), decimals: 6 });
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Figure label={W.figures.pnl} value={money(pnl, true)} tone={moneyTone(pnl)} />
        <Figure label={W.figures.roi} value={p.roiBps === null ? "—" : `${p.roiBps > 0 ? "+" : p.roiBps < 0 ? "−" : ""}${Math.abs(p.roiBps / 100).toFixed(1)}%`} />
        <Figure label={W.figures.winRate} value={`${p.winRatePct}%`} />
        <Figure label={W.figures.rounds} value={p.rounds.toLocaleString("en-US")} />
        <Figure label={W.figures.streak} value={String(p.bestStreak)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <ReputationCard reputation={reputation} />
        <BadgeGrid badges={badges} />
      </div>
      <section className="flex flex-col gap-3" aria-labelledby="profile-recent">
        <h2 id="profile-recent" className="type-label-micro text-ink-secondary">{W.recent}</h2>
        <ol className="flex flex-col divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-surface-1">
          {p.recent.map((r) => {
            const v = BigInt(r.pnlBase);
            return (
              <li key={r.market} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="min-w-28 type-body-strong text-ink">{`${r.symbol} ${formatCadence(r.cadenceSec)}`}</span>
                <span className="type-caption text-ink-secondary">{W.outcome[r.outcome]}</span>
                <span className="type-caption text-ink-secondary tabular-nums">{when(r.settledSec)}</span>
                <span className={`ml-auto type-body-strong tabular-nums ${TONE[moneyTone(v)]}`}>{money(v, true)}</span>
                <Link href={`/proof/${r.market}`} className="inline-flex min-h-touch items-center type-caption text-ink underline-offset-4 hover:underline">{W.proof}</Link>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}

export async function ProfileScreen({ address }: { address: Address }) {
  await connection();
  const [p, named] = await Promise.all([readProfile(address).catch(() => null), people().profiles([address]).catch(() => new Map())]);
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const display = named.get(address.toLowerCase())?.displayName ?? null;
  const tier = p && !p.house ? recordOf({ wins: p.wins, losses: p.losses, currentWinStreak: p.currentStreak, fillCount: p.rounds, stakeBase: BigInt(p.stakeBase), decimals: 6 }).reputation.tier : null;
  const meta = p && !p.house ? [W.tierLine(tier!), p.rank ? W.place(p.rank, p.of) : W.unranked] : [short];
  return (
    <div className="mx-auto flex w-full max-w-(--content-wide) flex-col gap-8 px-gutter py-10 lg:px-gutter-desktop">
      <ProfileHeader address={address} name={display ?? short} meta={display ? [short, ...meta] : meta} action={{ label: W.explorer, href: addressUrl(address, webEnv.markets.network) }} />
      <ProfileSocial address={address} />
      {!p ? (
        <p className="rounded-lg border border-hairline bg-surface-1 p-4 type-body text-ink-secondary">{W.unreadable}</p>
      ) : p.house ? (
        <p className="rounded-lg border border-hairline bg-surface-1 p-4 type-body text-ink-secondary">{W.house}</p>
      ) : p.rounds === 0 ? (
        <p className="rounded-lg border border-hairline bg-surface-1 p-4 type-body text-ink-secondary">{W.none}</p>
      ) : (
        <Record p={p} />
      )}
    </div>
  );
}
