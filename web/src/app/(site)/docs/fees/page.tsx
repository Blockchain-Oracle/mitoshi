// /docs/fees — who pays what (S20, L-20; engine.md: no trading-fee field, no settlement fee Q-005; the relay).
import type { Metadata } from "next";
import { H1, Lead, Table } from "@/features/docs/Prose";

export const metadata: Metadata = { title: "Fees" };

export default function Page() {
  return (
    <>
      <H1>Fees</H1>
      <Lead>The price you see is the book&apos;s: Mitoshi adds no trading or settlement fee, and pays your taps&apos; network fees.</Lead>
      <Table
        head={["Fee", "Who pays", "How much"]}
        rows={[
          ["Trading", "—", "None: the engine has no trading fee."],
          ["Settlement", "—", "None: a winning contract pays $1.00, all of it."],
          ["A tap's network fee", "Mitoshi's relay", "Paid in pathUSD for calls inside its policy; you hold no gas token."],
          ["Arming a Trading Balance", "You", "A fraction of a cent, once."],
          ["Range, Moonshot, Parlay", "—", "Priced into the stake the ticket shows before you confirm; nothing on top."],
          ["Boost", "You, to the reserve", "A premium the reserve keeps for fronting the position, shown on the ticket before you confirm."],
        ]}
      />
    </>
  );
}
