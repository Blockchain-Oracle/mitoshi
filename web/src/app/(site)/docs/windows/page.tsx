// /docs/windows — what a Window is, the lanes, and its life (S20, L-20; venue-spec.json, ResolveLib).
import type { Metadata } from "next";
import { A, H1, H2, Lead, Ol, P, Table } from "@/features/docs/Prose";

export const metadata: Metadata = { title: "Windows and lanes" };

export default function Page() {
  return (
    <>
      <H1>Windows and lanes</H1>
      <Lead>A Window is one asset over a fixed stretch of time. UP wins if it closes at or above where it opened; DOWN wins if below.</Lead>
      <H2>Lanes</H2>
      <Table
        head={["Assets", "Lanes", "When"]}
        rows={[
          ["BTC, ETH, SOL", "5 minutes", "Around the clock; a new one opens every five minutes"],
          ["AAPL, AMD, AMZN, GOOGL, META, MSFT, NVDA, PLTR, TSLA", "5, 15 and 60 minutes", "In NYSE hours"],
          ["The same nine stocks", "24/7 · 5, 15 and 60 minutes", "In and out of NYSE hours, on RedStone's 24/7 feeds"],
          ["The same nine stocks", "Gap", "Across the weekend, to Monday's open"],
        ]}
      />
      <P>RedStone&apos;s 24/7 stock feeds pause daily around 04:00 ET, so no 24/7 Window spans that gap; the terminal says when the next one opens.</P>
      <H2>A Window&apos;s life</H2>
      <Ol
        items={[
          <>It opens and waits for its <b>opening print</b> — the signed price at its start (the chip reads &ldquo;pricing…&rdquo;). That print is the line UP and DOWN are measured against.</>,
          <>It <b>trades</b>: makers rest prices on its order book and taps take them. A taker trade is immediate-or-cancel.</>,
          <>It <b>locks</b> shortly before its close; positions can no longer be sold into the book.</>,
          <>It <b>closes</b> on its closing print, and <A href="/docs/settlement">settles</A>: close ≥ open pays UP, close &lt; open pays DOWN. A tie goes UP.</>,
        ]}
      />
    </>
  );
}
