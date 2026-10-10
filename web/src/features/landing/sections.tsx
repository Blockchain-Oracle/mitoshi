// The landing's sections below the hero (S20, L-11), server components with no client JS. Sources (21st map, E.1
// Landing row): the pillars are 27082 · hirael/feature-10's bento on a hairline grid (its quote cell became the two
// pillars at equal size; metric tiles and the checklist kept); the steps are 26891 · ln-dev7/how-it-works-09 (numbered
// circles on a connector, typography only); the figures are 29870 · shadcnui-blocks/stats-05 (three tiles, real
// on-chain numbers only); the closing band is 28155 · shadcndesign/cta-section-1 (solid accent, cream ink).
import { ArrowRight, Building2, ChartLine, Check } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { BRAND } from "@/lib/copy";
import { LANDING } from "./copy";
import { landingFigures } from "./figures";

const L = LANDING;
const START = "/trade/BTC";
const count = new Intl.NumberFormat("en-US");

function Eyebrow({ children }: { children: string }) {
  return <span className="type-label-micro text-ink-secondary">{children}</span>;
}

export function Pillars() {
  const P = L.pillars;
  const cell = "flex flex-col gap-3 bg-ground p-6";
  return (
    <section className="landing-defer flex flex-col gap-8" aria-labelledby="pillars-title">
      <div className="flex max-w-2xl flex-col gap-3">
        <Eyebrow>{P.eyebrow}</Eyebrow>
        <h2 id="pillars-title" className="type-title text-ink">{P.title}</h2>
        <p className="type-body text-ink-secondary">{P.lead}</p>
      </div>
      <div className="grid grid-cols-6 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline">
        {[
          { p: P.markets, href: START, Icon: ChartLine },
          { p: P.stocks, href: "/stocks", Icon: Building2 },
        ].map(({ p, href, Icon }) => (
          <Link key={href} href={href} className={`${cell} group col-span-6 md:col-span-3 md:row-span-2`}>
            <span className="flex items-center gap-2 type-label-micro text-ink-secondary"><Icon aria-hidden className="size-4 text-accent" />{p.tag}</span>
            <span className="type-title text-ink">{p.title}</span>
            <span className="type-body text-ink-secondary">{p.body}</span>
            <span className="mt-auto inline-flex items-center gap-1 pt-2 type-caption text-ink">{p.link} <ArrowRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" /></span>
          </Link>
        ))}
        {P.metrics.map((m) => (
          <div key={m.label} className={`${cell} col-span-3 md:col-span-2`}>
            <span className="type-label-micro text-ink-secondary">{m.label}</span>
            <span className="type-display text-ink tabular-nums">{m.value}</span>
            <span className="type-caption text-ink-secondary">{m.caption}</span>
          </div>
        ))}
        <div className={`${cell} col-span-6 md:col-span-2`}>
          <span className="type-label-micro text-ink-secondary">{P.autoTitle}</span>
          <ul className="flex flex-col gap-2">
            {P.auto.map((line) => (
              <li key={line} className="flex items-start gap-2 type-body text-ink"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function Steps() {
  const S = L.steps;
  return (
    <section className="landing-defer flex flex-col items-center gap-10 text-center" aria-labelledby="steps-title">
      <div className="flex flex-col items-center gap-3">
        <Eyebrow>{S.eyebrow}</Eyebrow>
        <h2 id="steps-title" className="type-title text-ink">{S.title}</h2>
      </div>
      <ol className="relative grid w-full grid-cols-1 gap-8 md:grid-cols-3">
        <span aria-hidden className="absolute inset-x-0 top-6 hidden h-px bg-hairline md:block" />
        {S.items.map((s) => (
          <li key={s.n} className="relative flex flex-col items-center gap-4">
            <span className="relative z-10 flex size-12 items-center justify-center rounded-full border border-hairline bg-ground type-caption text-ink-secondary tabular-nums">{s.n}</span>
            <span className="type-body-strong text-ink">{s.title}</span>
            <span className="max-w-xs type-body text-ink-secondary">{s.body}</span>
          </li>
        ))}
      </ol>
      <Link href={START} className="inline-flex min-h-touch items-center gap-2 rounded-full bg-accent-fill px-6 type-body-strong text-on-accent!">
        {S.cta} <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  );
}

function FigureTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface-1 p-6">
      <span className="type-display text-ink tabular-nums">{value}</span>
      <span className="type-body text-ink-secondary">{label}</span>
    </div>
  );
}

/** The live figures: read per request (never at build), kept minutes in memory; nothing at all when unreadable. */
export async function Figures() {
  await connection();
  const f = await landingFigures();
  if (!f) return null;
  const F = L.figures;
  return (
    <section className="landing-defer flex flex-col gap-8" aria-labelledby="figures-title">
      <div className="flex max-w-2xl flex-col gap-3">
        <Eyebrow>{F.eyebrow}</Eyebrow>
        <h2 id="figures-title" className="type-title text-ink">{F.title}</h2>
        <p className="type-body text-ink-secondary">{F.lead}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <FigureTile value={count.format(f.windowsOpened)} label={F.opened} />
        <FigureTile value={count.format(f.windowsResolved)} label={F.resolved} />
        <FigureTile value={count.format(f.windowsOpen)} label={F.open} />
      </div>
    </section>
  );
}

export function Cta() {
  const C = L.cta;
  return (
    <section className="landing-defer rounded-lg bg-accent-fill px-6 py-14 text-center" aria-labelledby="cta-title">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-6">
        <span className="type-label-micro text-on-accent/80"><span lang="ja">{BRAND.kanji}</span> · {BRAND.tagline}</span>
        <h2 id="cta-title" className="type-display text-on-accent">{C.title}</h2>
        <p className="type-body text-on-accent/80">{C.body}</p>
        <Link href={START} className="inline-flex min-h-touch items-center gap-2 rounded-full bg-on-accent px-6 type-body-strong text-accent-fill!">
          {C.button} <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </section>
  );
}
