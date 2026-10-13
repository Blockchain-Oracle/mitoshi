// Ported from Owarine 90a91d71:web/src/features/landing/{LandingLoop,LandingMarkets}.tsx (R4-13a, D-227) — under the
// hero: the tape of what is open now, the three steps, and what trades with each kind's Windows open. Owarine reads a
// client board; here every figure is the index's, read on the server (`board.ts`), so the site group ships no markets
// runtime. The tape slides on the kit's InfiniteSlider (still under reduced motion). On Mitoshi's tokens (`landing.css`).
import { ArrowUpRight } from "lucide-react";
import { connection } from "next/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { InfiniteSlider } from "@/components/kit/InfiniteSlider";
import { FluentArt } from "@/components/kit/SkyCollage";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import type { FluentName } from "@/lib/art/fluent";
import { formatCadence } from "@cwf/core/copy";
import { landingBoard, printUsd, type BoardAsset } from "./board";
import { WORDS } from "./words";

/** A band of every asset with Windows open, its last signed opening print and its shortest Window, sliding past. */
export async function LandingTape() {
  await connection();
  const board = await landingBoard();
  const rows = board?.assets ?? [];
  if (rows.length === 0) return <div className="lp-tape" aria-hidden />;
  return (
    <section aria-label={WORDS.tape.label} className="lp-tape">
      <InfiniteSlider gapRem={0} duration={Math.max(30, rows.length * 4)} durationOnHover={Math.max(90, rows.length * 12)} className="lp-tape-track">
        {rows.map((r) => (
          <Link key={r.symbol} href={`/trade/${r.symbol}`} className="lp-tape-item">
            <AssetDisc asset={r.symbol} className="lp-disc lp-disc--sm" />
            <span className="lp-tape-symbol">{r.symbol}</span>
            {r.printE8 ? <span className="lp-tape-print" title={WORDS.tape.print}>{printUsd(r.printE8)}</span> : null}
            <span className="lp-tape-chip">{formatCadence(r.cadenceSec)}</span>
            <span className="lp-tape-open">{WORDS.tape.open(r.open)}</span>
          </Link>
        ))}
      </InfiniteSlider>
    </section>
  );
}

function Head({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="lp-head">
      <span className="lp-eyebrow">{kicker}</span>
      <h2 className="lp-h2">{title}</h2>
    </div>
  );
}

/** "Tap. Watch. Bank it." — the three steps from a passkey to a position. */
export function LandingLoop() {
  const { loop } = WORDS;
  return (
    <section className="lp-section">
      <Head kicker={loop.kicker} title={loop.title} />
      <ol className="lp-steps">
        {loop.steps.map((s) => (
          <li key={s.n} className="lp-step">
            <FluentArt name={s.art} size={84} className="lp-step-art" />
            <span className="lp-step-n">{s.n}</span>
            <h3 className="lp-h3">{s.title}</h3>
            <p className="lp-muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Card({ href, title, body, art, tone = "card", wide, children }: { href: string; title: string; body: string; art: FluentName; tone?: "card" | "accent" | "surface" | "cream"; wide?: boolean; children?: ReactNode }) {
  return (
    <Link href={href} className="lp-card" data-tone={tone} data-wide={wide ? "" : undefined}>
      <FluentArt name={art} size={104} className="lp-card-art" />
      <span className="flex items-start justify-between gap-3">
        <h3 className="lp-h3">{title}</h3>
        <ArrowUpRight aria-hidden className="lp-card-arrow" />
      </span>
      <p className="lp-card-body">{body}</p>
      <div className="lp-card-foot">{children}</div>
    </Link>
  );
}

function Names({ rows }: { rows: readonly BoardAsset[] }) {
  if (rows.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {rows.slice(0, 3).map((r) => (
        <span key={r.symbol} className="lp-name">
          <AssetDisc asset={r.symbol} className="lp-disc lp-disc--xs" />
          {r.symbol}
          {r.printE8 ? <span className="lp-name-print">{printUsd(r.printE8)}</span> : null}
        </span>
      ))}
    </span>
  );
}

/** "Crypto and stocks. Same two buttons." — each card with the Windows its kind has open, read from the index. */
export async function LandingMarkets() {
  await connection();
  const m = WORDS.markets;
  const board = await landingBoard();
  const of = (k: BoardAsset["kind"]) => board?.assets.filter((a) => a.kind === k) ?? [];
  const count = (n: number | undefined) => <span className="lp-count">{n === undefined ? m.reading : m.open(n)}</span>;
  return (
    <section className="lp-section">
      <Head kicker={m.kicker} title={m.title} />
      <div className="lp-cards">
        <Card href={m.cards.crypto.href} title={m.cards.crypto.title} body={m.cards.crypto.body} art="coin" tone="accent">
          <Names rows={of("crypto")} />
          {count(board?.open.crypto)}
        </Card>
        <Card href={m.cards.stocks.href} title={m.cards.stocks.title} body={m.cards.stocks.body} art="chartIncreasing" tone="surface">
          <Names rows={of("stock")} />
          {count(board?.open.stock)}
        </Card>
        <Card href={m.cards.parlay.href} title={m.cards.parlay.title} body={m.cards.parlay.body} art="admissionTickets" tone="cream">
          {count(board?.open.all)}
        </Card>
        <Card href={m.cards.games.href} title={m.cards.games.title} body={m.cards.games.body} art="joystick">
          {count(board?.open.all)}
        </Card>
      </div>
    </section>
  );
}

/** The markets section's frame while the index is read: the head and four empty cards, so nothing shifts. */
export function LandingMarketsWait() {
  const m = WORDS.markets;
  return (
    <section className="lp-section" aria-busy="true">
      <Head kicker={m.kicker} title={m.title} />
      <div className="lp-cards">
        {[0, 1, 2, 3].map((i) => <div key={i} className="lp-card skel" />)}
      </div>
    </section>
  );
}
