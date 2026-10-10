// /docs/testnet — what testnet means here, honestly (S20, L-20; D-210/F-S23-13, the faucet).
import type { Metadata } from "next";
import { H1, H2, Lead, P, Ul } from "@/features/docs/Prose";

export const metadata: Metadata = { title: "Testnet notes" };

export default function Page() {
  return (
    <>
      <H1>Testnet notes</H1>
      <Lead>Mitoshi runs on Tempo&apos;s testnet, Moderato, while it is in beta.</Lead>
      <H2>What that means</H2>
      <Ul
        items={[
          <>The money is testnet pathUSD from the faucet. It has no value and can&apos;t be bought or sold.</>,
          <>The order books, signed prints, settlement, exits and receipts are real contracts on a real chain; only the money is test money.</>,
          <>Testnets get reset and upgraded. Positions and balances there are not a record of anything of value.</>,
        ]}
      />
      <H2>Known limits</H2>
      <Ul
        items={[
          <>The faucet has a cooldown per account; Add money says when you can claim again.</>,
          <>RedStone is switching off its public gateways, in daily windows that grow until 29 October 2026. While one refuses, prints wait, so Windows don&apos;t open or settle until it answers again; a Window that gets no reliable print in time is void at half. Mitoshi moves to RedStone&apos;s authenticated gateway when its key is issued.</>,
          <>RedStone&apos;s 24/7 stock feeds pause daily around 04:00 ET; no 24/7 Window spans that gap.</>,
        ]}
      />
      <P>Nothing here is investment advice.</P>
    </>
  );
}
