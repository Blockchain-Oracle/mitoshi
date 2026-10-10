// Ported from Masayume 68f7a09:web/src/features/demo/DemoPage.tsx (itself `reference/yosuku/app/demo/page.tsx`) —
// "the walkthrough, in place of a video": the real product, dated captures of it, and every claim a transaction anyone
// can open. Kept section for section; every fact is Mitoshi's (`copy.ts`, `proofs.ts`), the traction line is the
// indexer's live count, and the video slot says it is being recorded until it is (L-13).
import { ArrowRightIcon, ChartCandlestickIcon, LogOutIcon, ScrollTextIcon, ShieldCheckIcon, SignatureIcon, SmartphoneIcon, VaultIcon } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import "@/styles/demo.css";
import "@/styles/demo-sections.css";
import { DEMO } from "./copy";
import { Eyebrow, Frame, Kicker, ProofLink, Reveal, Serif } from "./DemoBlocks";
import { DemoTraction } from "./DemoTraction";
import { DemoVideo } from "./DemoVideo";
import { CONTRACT_PROOFS, contractProof, contractProofHref, PROOFS_READ_ON, TX_PROOFS, txProofHref, txProofLabel } from "./proofs";

const { sections: S } = DEMO;
const TERMINAL = "/trade/BTC";

function Cta({ href, children, primary = false }: { href: string; children: ReactNode; primary?: boolean }) {
  return (
    <Link href={href} className={primary ? "demo-cta" : "demo-cta ghost"}>
      {children}
    </Link>
  );
}

function TopBar() {
  return (
    <div className="demo-bar">
      <div className="demo-bar-inner">
        <div className="demo-brand">
          {DEMO.bar.brand} <span className="demo-brand-sub">{DEMO.bar.sub}</span>
        </div>
        <div className="demo-bar-links">
          <Link href="/pitch" className="demo-bar-link">{DEMO.bar.pitch}</Link>
          <Link href={TERMINAL} className="demo-bar-open">
            {DEMO.bar.open} <ArrowRightIcon className="demo-bar-icon" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="demo-hero">
      <Eyebrow>{DEMO.hero.eyebrow}</Eyebrow>
      <Reveal immediate>
        <h1 className="demo-h1">
          {DEMO.hero.headline}
          <Serif>{DEMO.hero.headlineSerif}</Serif>
        </h1>
      </Reveal>
      <div className="demo-video-label">{DEMO.hero.videoLabel}</div>
      <Reveal immediate>
        <DemoVideo />
      </Reveal>
      <Reveal immediate>
        <p className="demo-lead">{DEMO.hero.lead}</p>
      </Reveal>
      <Reveal immediate className="demo-ctas">
        <Cta href={TERMINAL} primary>
          {DEMO.hero.open} <ArrowRightIcon className="demo-cta-icon" aria-hidden />
        </Cta>
        <Cta href="/pitch">{DEMO.hero.pitch}</Cta>
      </Reveal>
      <Suspense fallback={null}>
        <DemoTraction />
      </Suspense>
    </section>
  );
}

function Feature({ kicker, icon, headline, serif, body, link, frame, flip = false }: { kicker: string; icon: ReactNode; headline: string; serif: string; body: string; link: string; frame: ReactNode; flip?: boolean }) {
  return (
    <section className="demo-section">
      <Reveal className={flip ? "demo-order-2" : undefined}>
        <Kicker icon={icon}>{kicker}</Kicker>
        <h2 className="demo-h2">
          {headline}
          <Serif>{serif}</Serif>
        </h2>
        <p className="demo-body">{body}</p>
        <Link href={TERMINAL} className="demo-inline-link">
          {link} <ArrowRightIcon className="demo-cta-icon" aria-hidden />
        </Link>
      </Reveal>
      <Reveal className={flip ? "demo-order-1" : undefined}>{frame}</Reveal>
    </section>
  );
}

export function DemoPage() {
  const engine = contractProof("engine");
  const prints = contractProof("prints");
  const vault = contractProof("vault");

  return (
    <div className="demo-page">
      <TopBar />
      <Hero />

      <Feature
        kicker={S.tap.kicker}
        icon={<SmartphoneIcon className="demo-kicker-icon" aria-hidden />}
        headline={S.tap.headline}
        serif={S.tap.headlineSerif}
        body={S.tap.body}
        link={S.tap.link}
        frame={<Frame src="/demo/terminal.png" alt={DEMO.frame.terminal} width={1440} height={900} />}
      />
      <Feature
        flip
        kicker={S.exits.kicker}
        icon={<LogOutIcon className="demo-kicker-icon" aria-hidden />}
        headline={S.exits.headline}
        serif={S.exits.headlineSerif}
        body={S.exits.body}
        link={S.exits.link}
        frame={<Frame src="/demo/position.png" alt={DEMO.frame.position} width={390} height={844} phone />}
      />
      <Feature
        kicker={S.record.kicker}
        icon={<ScrollTextIcon className="demo-kicker-icon" aria-hidden />}
        headline={S.record.headline}
        serif={S.record.headlineSerif}
        body={S.record.body}
        link={S.record.link}
        frame={<Frame src="/demo/history.png" alt={DEMO.frame.history} width={1440} height={900} />}
      />

      <section className="demo-section single">
        <Reveal>
          <Kicker icon={<ChartCandlestickIcon className="demo-kicker-icon" aria-hidden />}>{S.depth.kicker}</Kicker>
          <h2 className="demo-h2">
            {S.depth.headline}
            <Serif>{S.depth.headlineSerif}</Serif>
          </h2>
        </Reveal>
        <div className="demo-cards">
          {[
            { icon: <ChartCandlestickIcon className="demo-card-icon" aria-hidden />, card: S.depth.cards.book, proof: engine },
            { icon: <SignatureIcon className="demo-card-icon" aria-hidden />, card: S.depth.cards.prints, proof: prints },
            { icon: <VaultIcon className="demo-card-icon" aria-hidden />, card: S.depth.cards.vault, proof: vault },
          ].map(({ icon, card, proof }) => (
            <Reveal key={card.title}>
              <div className="demo-card">
                {icon}
                <div className="demo-card-title">{card.title}</div>
                <div className="demo-card-body">{card.body}</div>
                <div className="demo-card-proof">
                  <ProofLink href={contractProofHref(proof)} label={`${S.depth.proven} · ${proof.label}`} reference={proof.address} />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="demo-section single">
        <Reveal>
          <Kicker icon={<ShieldCheckIcon className="demo-kicker-icon" aria-hidden />}>{S.verify.kicker}</Kicker>
          <h2 className="demo-h2">
            {S.verify.headline}
            <Serif>{S.verify.headlineSerif}</Serif>
          </h2>
          <p className="demo-body wide">{S.verify.body}</p>
          <p className="demo-proof-note">{S.verify.readOn(PROOFS_READ_ON)}</p>
        </Reveal>
        <div className="demo-proofs">
          {TX_PROOFS.map((proof) => (
            <Reveal key={proof.hash}>
              <div className="demo-proof-row">
                <ProofLink href={txProofHref(proof)} label={txProofLabel(proof)} reference={proof.hash} />
                <p className="demo-proof-note">{proof.detail}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p className="demo-proof-note">{S.verify.contracts}</p>
        </Reveal>
        <div className="demo-proofs">
          {CONTRACT_PROOFS.map((proof) => (
            <Reveal key={proof.key}>
              <div className="demo-proof-row">
                <ProofLink href={contractProofHref(proof)} label={proof.label} reference={proof.address} />
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="demo-close">
        <Reveal>
          <h2 className="demo-close-h2">
            {DEMO.close.headline}
            <Serif>{DEMO.close.headlineSerif}</Serif>
          </h2>
          <div className="demo-close-ctas">
            <Cta href={TERMINAL} primary>
              {DEMO.hero.open} <ArrowRightIcon className="demo-cta-icon" aria-hidden />
            </Cta>
            <Cta href="/pitch">{DEMO.hero.pitch}</Cta>
          </div>
          <div className="demo-footer-line">{DEMO.close.footer}</div>
        </Reveal>
      </section>
    </div>
  );
}
