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
          ["AAPL, AMZN, GOOGL, META, MSFT, NVDA, TSLA", "24/7 · 5, 15 and 60 minutes", "In and out of NYSE hours, settled on RedStone's 24/7 feed for that stock — not the NYSE print. AMD and PLTR have no 24/7 feed, so theirs is paused"],
          ["The nine stocks", "Gap", "From Friday's close to the next 09:30 ET open (Monday's, or Tuesday's after a holiday); calls lock Sunday 20:00 ET"],
        ]}
      />
      <P>RedStone&apos;s 24/7 stock feeds pause daily around 04:00 ET, so no 24/7 Window spans that gap; the terminal says when the next one opens.</P>
      <H2>Hours, halts and pauses</H2>
      <P>
        The terminal names the NYSE session beside the Window chip — pre-market, open, after hours, closed, weekend or holiday — and the next open or
        close in your own time with New York&apos;s beside it (&ldquo;reopens Mon 14:30 (09:30 ET)&rdquo;). Outside the session a stock&apos;s Regular
        lane has no Window and says so; its 24/7 lane and the weekend Gap trade outside those hours.
      </P>
      <P>
        A <b>halt</b> stops new calls on a Window: &ldquo;Trading halted&rdquo; when the exchange stops the stock, &ldquo;Signed price stale&rdquo; when the
        signed price a Window settles on goes stale or short of signers. UP and DOWN say why and the banner above them says since when. A call already
        open settles on its signed close, or the Window voids if no print can be recorded, and both sides pay 0.5. Every halt of the last 30 days is on{" "}
        <A href="/status/halts">the halts board</A>.
      </P>
      <P>
        A <b>corporate action</b> (a split, a token multiplier change) pauses the Windows it would cut through; the Window chip and UP/DOWN say
        &ldquo;Paused: corporate action&rdquo;. An upcoming earnings report is named beside the session, and on the Window that sits on it the line
        warns that prices can gap — a warning, never a block. NFLX is bridged to Tempo testnet but no signed price source carries it, and no attested
        source for pre-IPO companies exists on Tempo yet: both are listed as paused rather than hidden.
      </P>
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
