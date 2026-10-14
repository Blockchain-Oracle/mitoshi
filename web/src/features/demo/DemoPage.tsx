// Ported from Owarine 90a91d71:web/src/features/demo/DemoPage.tsx (R4-13a, D-227: its 8 Oct rebuild) — the sticker,
// "Watch it work", one lede, the way in and the docs; a dated product walkthrough; four claims a judge can check,
// one line and one link each; live figures from the index;
// the receipts. It renders inside the app shell with no bar of its own (one chrome, one inset: the stage pads). On
// Mitoshi's tokens (`styles/demo.css`), so both themes read. Every link opens real evidence (`proofs.ts`, the index).
import { ArrowRight, BadgeCheck, Fingerprint, ReceiptText, Stamp, type LucideIcon } from "lucide-react";
import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { Sticker } from "@/components/kit/Sticker";
import { landingBoard } from "@/features/landing/board";
import { DOCS_URL } from "@/lib/docs-url";
import "@/components/kit/kit.css";
import "@/styles/demo.css";
import { DEMO } from "./copy";
import { DemoTraction, DemoTractionWait } from "./DemoTraction";
import { DemoVideo } from "./DemoVideo";
import { contractProof, contractProofHref, PROOFS_READ_ON, TX_PROOFS, txProofHref, txProofLabel } from "./proofs";

const TERMINAL = "/trade/BTC";

interface Claim {
  id: keyof typeof DEMO.claims;
  icon: LucideIcon;
  href: string;
  external?: boolean;
}

function Claims({ latestProof }: { latestProof: string | null }) {
  const claims: Claim[] = [
    { id: "passkey", icon: Fingerprint, href: TERMINAL },
    { id: "prints", icon: Stamp, href: contractProofHref(contractProof("prints")), external: true },
    // The latest settled Window's proof, from the index; without the read, the verifier's own page.
    { id: "settles", icon: ReceiptText, href: latestProof ?? contractProofHref(contractProof("prints")), external: latestProof === null },
    { id: "recount", icon: BadgeCheck, href: "/stats" },
  ];
  return (
    <div className="demo-claims">
      {claims.map(({ id, icon: Glyph, href, external }) => {
        const c = DEMO.claims[id];
        const body = (
          <>
            <span className="demo-claim-icon"><Glyph aria-hidden /></span>
            <span className="demo-claim-title">{c.title}</span>
            <span className="demo-claim-line">{c.line}</span>
            <span className="demo-claim-cta">{c.cta} <ArrowRight aria-hidden /></span>
          </>
        );
        return external ? (
          <a key={id} href={href} target="_blank" rel="noreferrer" className="demo-claim">{body}</a>
        ) : (
          <Link key={id} href={href} className="demo-claim">{body}</Link>
        );
      })}
    </div>
  );
}

async function LiveClaims() {
  await connection();
  const board = await landingBoard();
  const latest = board?.settled[0]?.market ?? null;
  return <Claims latestProof={latest ? `/proof/${latest}` : null} />;
}

export function DemoPage() {
  return (
    <div className="demo">
      <section className="demo-top">
        <div className="demo-head">
          <div className="demo-head-copy">
            <Sticker tone="profit" tilt={-4} size="sm" className="w-fit">{DEMO.sticker}</Sticker>
            <h1 className="demo-h1">{DEMO.heading}</h1>
            <p className="demo-lede">{DEMO.lede}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={TERMINAL} className="kit-pill kit-pill--accent kit-pill--md" data-primary-action>
              {DEMO.actions.open} <ArrowRight aria-hidden />
            </Link>
            <a href={DOCS_URL} className="kit-pill kit-pill--ghost kit-pill--md">{DEMO.actions.docs}</a>
          </div>
        </div>
        <DemoVideo />
      </section>

      <section className="demo-block" aria-labelledby="demo-claims">
        <h2 id="demo-claims" className="demo-h2">{DEMO.claimsTitle}</h2>
        <Suspense fallback={<Claims latestProof={null} />}>
          <LiveClaims />
        </Suspense>
      </section>

      <section className="demo-block" aria-labelledby="demo-live">
        <h2 id="demo-live" className="demo-h2">{DEMO.liveTitle}</h2>
        <Suspense fallback={<DemoTractionWait />}>
          <DemoTraction />
        </Suspense>
      </section>

      <section className="demo-block" aria-labelledby="demo-receipts">
        <div className="demo-receipts-head">
          <h2 id="demo-receipts" className="demo-h2">{DEMO.receiptsTitle}</h2>
          <p className="demo-note">{DEMO.receiptsOn(PROOFS_READ_ON)}</p>
        </div>
        <ul className="demo-receipts">
          {TX_PROOFS.map((proof) => (
            <li key={proof.hash}>
              <a href={txProofHref(proof)} target="_blank" rel="noreferrer" className="demo-receipt" title={proof.detail}>
                {txProofLabel(proof)} <ArrowRight aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
