// /terms (S20; shares the docs layout): the testnet terms of use, in plain words. S13 adds what you post and Sensei.
import type { Metadata } from "next";
import { DocsLayout } from "@/features/docs/DocsLayout";
import { H1, H2, Lead, Ul } from "@/features/docs/Prose";

export const metadata: Metadata = { title: "Terms" };

export default function Page() {
  return (
    <DocsLayout>
      <H1>Terms</H1>
      <Lead>Mitoshi is a beta on Tempo testnet. Using it means accepting these terms.</Lead>
      <H2>Testnet only</H2>
      <Ul
        items={[
          <>The money on Mitoshi is testnet pathUSD from a faucet. It has no value, can&apos;t be bought or sold, and nothing you do here wins or loses real money.</>,
          <>Testnets get reset and upgraded; balances and positions there may disappear.</>,
          <>Nothing on Mitoshi is investment, financial or legal advice.</>,
        ]}
      />
      <H2>Using it fairly</H2>
      <Ul
        items={[
          <>Don&apos;t abuse the faucet or the fee relay, or try to take more than its limits allow.</>,
          <>Some markets aren&apos;t available in some regions, and Mitoshi may keep them closed where the law requires.</>,
          <>You are responsible for your device and your passkey; Mitoshi can&apos;t recover an account whose passkey is lost.</>,
        ]}
      />
      <H2>What you post</H2>
      <Ul
        items={[
          <>Rooms, takes, profiles and reactions are public. Don&apos;t post spam, abuse, scams, impersonation or anything illegal; don&apos;t post someone else&apos;s private information.</>,
          <>Anyone can report a post or a profile and block a person. A moderator may hide what breaks these rules; repeated abuse can lose the right to post.</>,
          <>What you write stays yours. By posting it you let Mitoshi store it and show it to others, until you delete it.</>,
          <>A take is a call said out loud, not a trade, and not advice to anyone. Nothing trades from a post.</>,
        ]}
      />
      <H2>Sensei</H2>
      <Ul
        items={[
          <>Sensei is an AI model reading the figures on your screen. It can be wrong, it never trades for you, and nothing it says is financial advice.</>,
          <>It sends your questions to an AI provider only after you agree to the one it names.</>,
        ]}
      />
      <H2>No warranty</H2>
      <Ul
        items={[
          <>Mitoshi and its contracts are provided as they are. Software and oracles can fail; a Window without a reliable print is voided at half, and other failures may happen.</>,
          <>Mitoshi may change, pause or end the beta at any time.</>,
        ]}
      />
    </DocsLayout>
  );
}
