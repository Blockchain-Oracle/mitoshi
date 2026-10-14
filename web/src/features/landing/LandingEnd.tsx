// The end of the page, rebuilt (round 7). The proof: three counts from the index rolling in digit by digit (From 21st.dev
// 20071 unlumen/animate-digits, rebuilt in CSS — no motion runtime) and the newest signed close of five different
// assets as receipts, each to its proof. The final call (From 21st.dev 28155 shadcndesign/cta-section-1: a centred
// headline and one action) carries the store buttons and the QR. The footer is From 21st.dev 29772
// scrollxui/footer-with-minimal-outline: a brand block, link columns and the outlined 見通し watermark.
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Seal } from "@/components/kit/Seal";
import { ExternalLink } from "@/components/shell/ExternalLink";
import { QrCode } from "@/components/ui/qr-code";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { formatCadence } from "@cwf/core/copy";
import { BRAND, FOOTER } from "@/lib/copy";
import { webEnv } from "@/lib/env";
import { landingFigures, landingReceipts, type SettledReceipt } from "./figures";
import { START } from "./LandingHero";
import { printUsd } from "./print-usd";
import { WORDS } from "./words";
import type { ReactNode } from "react";

const COUNT = new Intl.NumberFormat("en-US");
const STOCK24 = 2;

/** A count whose digits roll in once in view (CSS, `landing-end.css`), read as one number by a screen reader. */
function Digits({ value }: { value: number }) {
  const text = COUNT.format(value);
  return (
    <span className="lp-digits" aria-label={text}>
      {[...text].map((ch, i) => (
        <span key={i} aria-hidden className={/\d/.test(ch) ? "lp-digit" : "lp-digit-sep"} style={{ animationDelay: `${i * 30}ms` }}>
          {ch}
        </span>
      ))}
    </span>
  );
}

function ago(sec: number, nowSec: number): string {
  const d = Math.max(0, nowSec - sec);
  return d < 3600 ? `${Math.max(1, Math.round(d / 60))} min` : d < 86_400 ? `${Math.round(d / 3600)} h` : `${Math.round(d / 86_400)} d`;
}

function Receipt({ r, nowSec }: { r: SettledReceipt; nowSec: number }) {
  const p = WORDS.proof;
  return (
    <li>
      <Link href={`/proof/${r.market}`} className="lp-receipt">
        <AssetDisc asset={r.symbol} className="lp-receipt-disc" />
        <span className="lp-receipt-main">
          <b>{r.symbol} {r.basis === STOCK24 ? "24/7 " : ""}{formatCadence(r.cadenceSec)}</b>
          {r.openE8 && r.closeE8 ? <span className="lp-receipt-prices">{printUsd(r.openE8)} → {printUsd(r.closeE8)}</span> : null}
          <span className="lp-receipt-sub">
            {[r.signers ? p.signers(r.signers) : null, r.resolvedSec ? p.ago(ago(r.resolvedSec, nowSec)) : null].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="lp-outcome" data-outcome={r.outcome}>{p.outcome[r.outcome]}</span>
        <ChevronRight aria-hidden className="lp-receipt-go" />
      </Link>
    </li>
  );
}

async function ProofBody() {
  await connection();
  const p = WORDS.proof;
  const [figures, receipts] = await Promise.all([landingFigures(), landingReceipts()]);
  const nowSec = Math.floor(Date.now() / 1000);
  const stats = figures
    ? [
        { value: figures.windowsOpened, label: p.figures.opened },
        { value: figures.windowsResolved, label: p.figures.resolved },
        { value: figures.settledToday, label: p.figures.today },
      ]
    : [];
  return (
    <>
      {stats.length > 0 ? (
        <ul className="lp-stats">
          {stats.map((s) => (
            <li key={s.label} className="lp-stat">
              <Digits value={s.value} />
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="lp-receipts">
        <span className="lp-eyebrow lp-eyebrow--quiet">{p.settled}</span>
        {receipts === null ? (
          <p className="lp-quiet"><Link href="/markets">{p.unread}</Link></p>
        ) : receipts.length === 0 ? (
          <p className="lp-quiet">{p.none}</p>
        ) : (
          <ol className="lp-receipt-list">{receipts.map((r) => <Receipt key={r.market} r={r} nowSec={nowSec} />)}</ol>
        )}
      </div>
    </>
  );
}

export function LandingProof({ body }: { body: ReactNode }) {
  const p = WORDS.proof;
  return (
    <section className="lp-section lp-proof" aria-labelledby="lp-proof-title">
      <div className="lp-wrap lp-proof-grid">
        <header className="lp-head">
          <span className="lp-eyebrow">{p.kicker}</span>
          <h2 id="lp-proof-title" className="lp-h2">{p.title}</h2>
          <p className="lp-lead">{p.body}</p>
        </header>
        {body}
      </div>
    </section>
  );
}

export { ProofBody };

/** The last screen: the line again, the stores, the QR, one action. */
export function LandingFinal({ stores }: { stores: ReactNode }) {
  const f = WORDS.final;
  return (
    <section className="lp-final" aria-labelledby="lp-final-title">
      <div className="lp-final-glow" aria-hidden />
      <div className="lp-wrap lp-final-col">
        <Seal size="lg" stamp />
        <h2 id="lp-final-title" className="lp-final-title">
          <span>{f.title[0]}</span> <em>{f.title[1]}</em>
        </h2>
        <p className="lp-line">{f.line}</p>
        <div className="lp-final-row">
          <div className="lp-final-actions">
            {stores}
            <Link href={START} className="lp-btn lp-btn--accent">{f.start}</Link>
          </div>
          <figure className="lp-final-qr">
            <QrCode value={`${webEnv.appOrigin}/download`} label={f.qr} className="lp-final-qr-code" bgClassName="lp-qr-bg" inkClassName="lp-qr-ink" />
            <figcaption>{f.scan}</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

/** The site's footer (the landing; 21st.dev 29772's columns and outlined watermark). */
export function SiteFooter() {
  const c = WORDS.footer;
  return (
    <footer className="lp-footer">
      <div className="lp-wrap lp-footer-grid">
        <div className="lp-footer-brand">
          <Link href="/" className="lp-brand" aria-label={WORDS.nav.home}>
            <Seal size="md" />
            <span className="lp-brand-name">{BRAND.name}</span>
            <span lang="ja" className="lp-footer-kanji">{BRAND.kanji}</span>
          </Link>
          <p className="lp-quiet">{c.tagline}</p>
          <p className="lp-footer-built">{c.built}</p>
        </div>
        {c.columns.map((col) => (
          <nav key={col.title} className="lp-footer-col" aria-label={col.title}>
            <span className="lp-footer-head">{col.title}</span>
            {col.links.map((l) => (l.href.startsWith("http") ? <ExternalLink key={l.label} href={l.href} className="lp-footer-link">{l.label}</ExternalLink> : <Link key={l.label} href={l.href} className="lp-footer-link">{l.label}</Link>))}
          </nav>
        ))}
      </div>
      <div className="lp-wrap lp-footer-base">
        <p>{FOOTER.disclosure}</p>
        <p>{c.marks}</p>
      </div>
      <div className="lp-footer-mark" aria-hidden lang="ja">{BRAND.kanji}</div>
    </footer>
  );
}
