// Ported from Owarine 90a91d71:web/src/features/landing/LandingEnd.tsx (R4-13a, D-227) — "Every close is signed": the
// index's counts and the last Windows to settle, each to its proof page (`/proof/<market>`); then the sky again, the
// line again, one button, and the footer. Owarine's roadmap block is not ported (its phases are Canton's). Figures and
// rows are the index's (`board.ts`, `figures.ts`), read on the server.
import { ArrowRight } from "lucide-react";
import { connection } from "next/server";
import Link from "next/link";
import { Seal } from "@/components/kit/Seal";
import { SkyCollage, type CollageObject } from "@/components/kit/SkyCollage";
import Footer from "@/components/shell/Footer";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { formatCadence } from "@cwf/core/copy";
import { landingBoard } from "./board";
import { landingFigures } from "./figures";
import { START } from "./LandingHero";
import { WORDS } from "./words";

const COUNT = new Intl.NumberFormat("en-US");
const STOCK24 = 2;

const utc = (sec: number) => new Date(sec * 1000).toISOString().slice(5, 16).replace("T", " ");

export async function LandingProof() {
  await connection();
  const p = WORDS.proof;
  const [board, figures] = await Promise.all([landingBoard(), landingFigures()]);
  const rows = board?.settled ?? [];
  const stats = figures
    ? [
        { value: figures.windowsOpened, label: p.figures.opened },
        { value: figures.windowsResolved, label: p.figures.resolved },
        { value: figures.windowsOpen, label: p.figures.open },
      ]
    : [];
  return (
    <section className="lp-section">
      <div className="lp-proof">
        <div className="flex flex-col gap-5">
          <div className="lp-head">
            <span className="lp-eyebrow">{p.kicker}</span>
            <h2 className="lp-h2">{p.title}</h2>
          </div>
          <p className="lp-lead">{p.body}</p>
          {stats.length > 0 ? (
            <ul className="lp-stats">
              {stats.map((s) => (
                <li key={s.label} className="lp-stat">
                  <span className="lp-stat-value">{COUNT.format(s.value)}</span>
                  <span className="lp-muted">{s.label}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex flex-col gap-3">
          <span className="lp-eyebrow lp-eyebrow--quiet">{p.settled}</span>
          {rows.length === 0 ? <p className="lp-muted">{board === null ? p.reading : p.none}</p> : null}
          {rows.map((w, i) => (
            <Link key={w.market} href={`/proof/${w.market}`} className="lp-settled" data-tilt={i % 2 === 0 ? "l" : "r"}>
              <AssetDisc asset={w.symbol} className="lp-disc" />
              <span className="min-w-0 flex-1">
                <span className="lp-settled-name">{w.symbol} {w.basis === STOCK24 ? "24/7 " : ""}{formatCadence(w.cadenceSec)}</span>
                <span className="lp-settled-when">{p.closed(utc(w.expirySec))}</span>
              </span>
              <span className="lp-outcome" data-outcome={w.outcome}>{p.outcome[w.outcome]}</span>
              <span className="lp-settled-link max-sm:hidden">{p.proof}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

const FINAL_SKY: readonly CollageObject[] = [
  { name: "trophy", x: 10, y: 30, size: 104, rotate: -12, float: 0 },
  { name: "moneyWithWings", x: 88, y: 26, size: 104, rotate: 10, float: 1 },
  { name: "key", x: 82, y: 78, size: 84, rotate: -20, float: 2 },
  { name: "sparkles", x: 18, y: 80, size: 64, rotate: 8, float: 3 },
];

/** The last screen: the sky again, the line again, one button. Then the footer. */
export function LandingFinal() {
  const f = WORDS.final;
  return (
    <>
      <SkyCollage objects={FINAL_SKY} className="lp-final">
        <div className="lp-final-col">
          <Seal size="lg" stamp />
          <h2 className="lp-h1 lp-h1--final">
            {f.title.map((l) => (
              <span key={l} className="block">{l}</span>
            ))}
          </h2>
          <Link href={START} className="kit-pill kit-pill--accent kit-pill--lg">
            {f.start} <ArrowRight aria-hidden />
          </Link>
          <Link href="/demo" className="lp-final-link">{f.demo}</Link>
        </div>
      </SkyCollage>
      <Footer />
    </>
  );
}
