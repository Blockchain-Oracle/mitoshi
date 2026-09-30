// `/` — the landing shell (plan C.3.7: Agari's landing, S1 shell and S20 content). A server component with no client
// JS: the headline is the LCP and sits in the static shell. Both pillars stand equal (E.1 landing note). Every claim is
// something that exists; the rest waits for its stage.
import { ArrowRight, Building2, ChartLine } from "lucide-react";
import Link from "next/link";
import MitoshiMark from "@/components/shell/MitoshiMark";
import { BRAND } from "@/lib/copy";

const PILLARS = [
  { href: "/markets", icon: ChartLine, eyebrow: "Markets", title: "Call where a price closes", body: "BTC, ETH, SOL and nine US stocks in Windows from five minutes to the weekend Gap. Your stake is your most you can lose." },
  { href: "/stocks", icon: Building2, eyebrow: "Stocks", title: "Own the stock, on Tempo", body: "Stock tokens bridged from Robinhood Chain, priced against signed quotes, with the backing on show." },
] as const;

export default function Landing() {
  return (
    <div className="mx-auto flex max-w-(--content-wide) flex-col gap-12 px-gutter py-12 lg:px-gutter-desktop lg:py-20">
      <section className="flex flex-col gap-5">
        <span className="size-12 text-ink"><MitoshiMark /></span>
        <p className="type-label-micro text-ink-secondary">{BRAND.name} · <span lang="ja">{BRAND.kanji}</span> · {BRAND.tagline}</p>
        {/* `hero-lines` (styles/base.css) reserves Sora's line count for this copy, so the font swap moves nothing (D-152). */}
        <h1 className="max-w-3xl hero-lines type-display text-ink">Prediction markets and stocks, one passkey away.</h1>
        <p className="max-w-2xl type-body text-ink-secondary">{BRAND.description}</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/markets" className="inline-flex min-h-touch items-center gap-2 rounded-full bg-accent-fill px-5 type-body-strong text-on-accent!">
            Open the markets <ArrowRight aria-hidden className="size-4" />
          </Link>
          <Link href="/how-it-works" className="inline-flex min-h-touch items-center rounded-full border border-border-strong px-5 type-body-strong text-ink">
            How it works
          </Link>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-2" aria-label="The two pillars">
        {PILLARS.map(({ href, icon: Icon, eyebrow, title, body }) => (
          <Link key={href} href={href} className="group flex flex-col gap-3 rounded-lg border border-hairline bg-surface-1 p-6 hover:border-border-strong">
            <span className="flex items-center gap-2 type-label-micro text-ink-secondary"><Icon aria-hidden className="size-4 text-accent" />{eyebrow}</span>
            <span className="type-title text-ink">{title}</span>
            <span className="type-body text-ink-secondary">{body}</span>
            <span className="mt-auto inline-flex items-center gap-1 type-caption text-ink">Go <ArrowRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" /></span>
          </Link>
        ))}
      </section>
    </div>
  );
}
