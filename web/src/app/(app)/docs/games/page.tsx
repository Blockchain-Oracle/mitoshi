// /docs/games — Range, Moonshot, Parlay and Boost (S20, L-20; S10, the games' own "how it pays" copy).
import type { Metadata } from "next";
import { H1, H2, Lead, Note, P } from "@/features/docs/Prose";

export const metadata: Metadata = { title: "Range, Moonshot, Parlay, Boost" };

export default function Page() {
  return (
    <>
      <H1>Range, Moonshot, Parlay, Boost</H1>
      <Lead>Four more ways to call a Window, settled on the same signed print.</Lead>
      <H2>Range</H2>
      <P>Call a band the close lands inside — or outside. A narrower band is less likely to catch the close, so it pays a bigger multiple. The full payout is set aside up front, so it can never come up short.</P>
      <H2>Moonshot</H2>
      <P>Pick a side and a multiple, and the house solves the level the print has to finish past: long wins at or above it, short at or below it. Further out pays more. The payout is set aside up front.</P>
      <H2>Parlay</H2>
      <P>Several legs on one ticket. The chances multiply down, so the payout multiplies up — and it is all or nothing: one miss and the stake is lost. The winning payout is set aside before the ticket is accepted.</P>
      <H2>Boost</H2>
      <P>A leveraged UP or DOWN: the reserve fronts the rest of the position and is repaid first from a sale. Your loss is capped at your stake, and a boost can knock out before the Window closes.</P>
      <Note>Too thin a book to price a ticket: it says so and takes nothing.</Note>
    </>
  );
}
