// /docs/one-tap — taps with no prompt: the wallet key and the Trading Balance session (S20, L-20; D-138, D-150).
import type { Metadata } from "next";
import { A, H1, H2, Lead, Note, P, Ul } from "@/features/docs/Prose";

export const metadata: Metadata = { title: "One-tap trading" };

export default function Page() {
  return (
    <>
      <H1>One-tap trading</H1>
      <Lead>One more biometric arms a key; after that every tap inside its limits signs itself and the fee is paid for you.</Lead>
      <H2>Turn on one-tap</H2>
      <P>The terminal offers it once you are signed in with a passkey (&ldquo;Turn on one-tap&rdquo;). Your passkey signs once to publish an access key on Tempo. The key can only place, cancel and redeem calls on the market engine and approve pathUSD to it, up to a daily dollar limit, and it expires after 24 hours. Your passkey keeps every other power.</P>
      <H2>Tap from a Trading Balance</H2>
      <P>Or set aside a budget in your Trading Balance. A key made on this device spends only that balance — up to a per-tap and a daily cap, for 6 hours, 24 hours or 7 days, as you choose. It can buy UP or DOWN on any live Window and never withdraw or send money anywhere. Daily caps reset at 00:00 UTC.</P>
      <H2>What a tap costs</H2>
      <Ul
        items={[
          <>Taps are free to send: Mitoshi&apos;s relay pays each tap&apos;s network fee in pathUSD, inside its policy.</>,
          <>Arming a Trading Balance is one passkey confirmation and a fraction of a cent.</>,
          <>Your position shows the moment the key has signed and sent the trade — &ldquo;Confirming on Tempo…&rdquo; — and the receipt swaps in what the engine booked, about half a second later. A median of 0.64 s from press to position on testnet.</>,
        ]}
      />
      <H2>Stop it</H2>
      <P>Every key and grant is listed in Settings, where Stop revokes it on chain. Stopping a Trading Balance session returns its unspent budget to the Trading Balance; positions it opened stay yours.</P>
      <Note>Skip one-tap and nothing changes but the prompt: every trade asks your passkey. See <A href="/docs/fees">fees</A> for who pays what.</Note>
    </>
  );
}
