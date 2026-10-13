// One theme on `/themes` (S16; R6, D-230; D-231) — the anatomy of 21st.dev 20113 ssychui/market-snapshot (name at the
// top left and its tag at the top right, the move as the big figure over its line, a footer of small facts), revamped
// per D-044 onto a basket strategy: the stocks' marks stacked before the name, the live / 24/7 / closed pill, the
// figure the weighted mix's week (ops' closes — never a follower's return) with the weighted price under it and the same
// week as a spark (`MixSpark`, from 30538), the mix as a partition bar with its legend, the rule, when a closed theme
// trades, and Follow beside the followers and the fee. The whole card opens the theme (a stretched link on its name);
// Follow opens the follow sheet there. The week streams in from the server under a placeholder of its own size, so
// nothing moves. Rendered on the server; only Follow is a client island. Refero: Copilot's "top movers" cards
// (50879a7a-12ba-4b53-a980-5ce6401f6875 — a spark, the move in its trend colour) for the week block; UGLYCASH's trader
// profile (c4c2bc7d-01a8-4e47-a349-0f667472460b) for Follow beside the followers count.
import Link from "next/link";
import { Suspense } from "react";
import { themeWeekBones } from "@/components/states/shapes/themes";
import { CardFollow } from "./CardFollow";
import { THEMES } from "./copy";
import { lanesText, ruleText, signedPct, toneOf, usd6, usdFloat } from "./format";
import type { ThemeStatus } from "./status";
import { MixSpark } from "./spark";
import { MemberStack, MixLegend, StatusPill, StatusPlate, themeName } from "./ThemeBits";
import type { CardMix, ThemeWire } from "./wire";

const C = THEMES.card;

async function Week({ mixes, id }: { mixes: Promise<Record<string, CardMix>>; id: string }) {
  const mix = (await mixes)[id] ?? null;
  const move = mix?.moveBps ?? null;
  if (!mix || mix.points.length < 2) return <p className="th-card-nochart">{mix?.missing.length ? C.noChart(mix.missing.join(", ")) : C.flat}</p>;
  return (
    <>
      <div className="th-card-figure">
        <span className="th-card-move numbers" data-tone={toneOf(move)}>{move === null ? "—" : signedPct(move)}</span>
        <span className="th-micro">{`${C.week} · ${C.weighted}`}</span>
        {mix.priceUsd !== null ? <span className="th-card-price numbers">{C.price(usdFloat(mix.priceUsd))}</span> : null}
      </div>
      <MixSpark points={mix.points} moveBps={move} id={id} />
    </>
  );
}

export function ThemeCard({ theme, status, nowSec, mixes }: { theme: ThemeWire; status: ThemeStatus; nowSec: number; mixes: Promise<Record<string, CardMix>> }) {
  const { card, spec } = theme;
  const name = themeName(card);
  const id = card.strategyId;
  const href = `/themes/${id}`;
  const fee = BigInt(card.feeBase);
  return (
    <article className="th-card" aria-label={C.aria(name)}>
      <header className="th-card-head">
        <MemberStack spec={spec} size="md" />
        <div className="th-card-title">
          <h2 className="th-card-name"><Link href={href} className="th-card-link">{name}</Link></h2>
          <span className="th-card-tag numbers">{`${C.count(spec.members.length)} · ${lanesText(spec)}`}</span>
        </div>
        <StatusPill status={status} nowSec={nowSec} />
      </header>
      {card.description ? <p className="th-card-blurb">{card.description}</p> : null}
      <div className="th-card-perf">
        <Suspense fallback={themeWeekBones()}>
          <Week mixes={mixes} id={id} />
        </Suspense>
      </div>
      <MixLegend spec={spec} />
      <p className="th-card-rule">{ruleText(spec.rule)}</p>
      <StatusPlate spec={spec} status={status} nowSec={nowSec} compact />
      <footer className="th-card-foot">
        <CardFollow href={href} name={name} strategyId={id} />
        <span className="th-card-meta numbers">{`${C.followers(card.subscribers)} · ${fee > 0n ? C.fee(usd6(fee)) : C.free}`}</span>
      </footer>
    </article>
  );
}
