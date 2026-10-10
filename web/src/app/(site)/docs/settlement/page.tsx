// /docs/settlement — prints, settle, void, payout (S20, L-20; ResolveLib, engine.md, the verdict copy, F-S23-13).
import type { Metadata } from "next";
import { A, H1, H2, Lead, Note, Ol, P } from "@/features/docs/Prose";

export const metadata: Metadata = { title: "Prints and settlement" };

export default function Page() {
  return (
    <>
      <H1>Prints and settlement</H1>
      <Lead>A Window settles on two signed numbers: its opening print and its closing print. The live line on screen never settles anything.</Lead>
      <H2>Signed prints</H2>
      <P>Prices come from RedStone as signed data packages. Mitoshi&apos;s price relay posts the packages for each Window&apos;s open and close on chain, and the engine&apos;s print verifier checks their signers itself — enough of RedStone&apos;s signers, close enough to the Window&apos;s boundary — before it records a print. Each position&apos;s details link to the proof of its prints.</P>
      <H2>Settlement</H2>
      <Ol
        items={[
          <>Once both prints are in, anyone can settle the Window. Mitoshi&apos;s settler does it shortly after the close.</>,
          <>The engine compares the close with the open: at or above pays UP, below pays DOWN. A winning contract pays $1.00; a losing one nothing.</>,
          <>If no reliable print arrives in time, the Window is void: both sides are returned at half, $0.50 a contract.</>,
          <>The settler then pays every winning position on its own, a few minutes after the close. Collecting it yourself only hurries it.</>,
        ]}
      />
      <P>A payout your account&apos;s receive policy blocks is not lost: it waits as credit you can collect once the engine is allowed.</P>
      <Note>On testnet, prints depend on RedStone&apos;s public gateways, which RedStone is switching off in daily windows; while one refuses, Windows wait for their prints (see <A href="/docs/testnet">testnet notes</A>).</Note>
    </>
  );
}
