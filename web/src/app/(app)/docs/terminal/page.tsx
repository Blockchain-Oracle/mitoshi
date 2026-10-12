// /docs/terminal — the one screen, part by part (S20, L-20; the S23 terminal, D-196/D-197).
import type { Metadata } from "next";
import { A, H1, H2, Lead, P, Table, Ul } from "@/features/docs/Prose";

export const metadata: Metadata = { title: "The terminal" };

export default function Page() {
  return (
    <>
      <H1>The terminal</H1>
      <Lead>The whole app is one screen at <A href="/trade/BTC">/trade/BTC</A>: the line, the Window on screen, and two buttons. Everything else opens over it.</Lead>
      <H2>On screen</H2>
      <Table
        head={["Part", "What it shows"]}
        rows={[
          ["Asset chip", "The asset and its live price; tap it to switch markets (favourites, crypto, stocks, search)."],
          ["Window chip", "The lane (5m, 15m, 1h, 24/7, Gap) and its clock: “trades 2:32”, “pricing…” while the opening print lands, “no Window” between rounds."],
          ["The line", "The live price from a display feed, so you can see where it's going. The “Line” mark is the Window's opening print; the “Signed” mark is the latest signed RedStone price."],
          ["The card on the chart", "Your stake, what UP and DOWN pay per dollar right now, the fees (free), and the trailing distance."],
          ["UP / DOWN", "One tap each. The multiple under the word is 1 ÷ the price you would pay."],
          ["Positions", "Each open position's value — what CLOSE pays now — its P&L and CLOSE. “≈” marks a value repriced on the line between book reads."],
        ]}
      />
      <H2>Modes</H2>
      <P>Under the chart: <b>Up / Down</b> (the default), <b>Range</b>, <b>Boost</b>, <b>Private</b> and <b>Parlay</b>. Range, Boost and Parlay are described in <A href="/docs/games">games</A>. Private spends from a private balance kept separate from your wallet, so a bet is harder to link back to you — it is not anonymous.</P>
      <H2>A position&apos;s details</H2>
      <P>Tap a position to see its Window, where it is held (wallet or Trading Balance), the Window&apos;s line, your stake and average price, what CLOSE pays now, the P&amp;L and when it settles — then Reduce by 25, 50 or 75 %, CLOSE, Add, set TP / SL, or open the proof of its prints.</P>
      <H2>Your account</H2>
      <Ul
        items={[
          <><b>History &amp; stats</b>: every closed round with lifetime P&amp;L, win rate, trades, win streak, best streak and volume, and a replay of each.</>,
          <><b>Activity</b>: the money moves — deposits, faucet claims, withdrawals — each linked to its receipt.</>,
          <><b>P&amp;L</b>: today, 7 days, 30 days or all time, with its curve.</>,
          <><b>Trade settings</b>: your tap size (it follows 5 % of what you can spend until you set it), Boost, the trailing distance, and the close tolerance — how far below the shown value a one-tap CLOSE may land without asking. The eye beside your balance hides figures on screen; the note on the chart turns music on.</>,
        ]}
      />
      <P>The first visit opens a five-step tour; it never shows again once dismissed.</P>
    </>
  );
}
