// /docs/account — signing up, other sign-ins, the money and where it is held (S20, L-20).
import type { Metadata } from "next";
import { A, H1, H2, Lead, Note, P, Ul } from "@/features/docs/Prose";

export const metadata: Metadata = { title: "Your account and money" };

export default function Page() {
  return (
    <>
      <H1>Your account and money</H1>
      <Lead>A passkey is your account: no seed phrase, no extension, no gas token.</Lead>
      <H2>Sign up with a passkey</H2>
      <P>Sign in on the terminal creates a passkey with Face ID, a fingerprint or a security key. Your device (or your password manager) keeps its private key; Mitoshi stores only the public key and its credential id, and your account address on Tempo comes from it. Signing in again later is the same biometric.</P>
      <P>A session cookie keeps you signed in for 30 days. It backs only the faucet claim and the live stream&apos;s ticket — your account&apos;s authority stays on chain, in your passkey.</P>
      <H2>Other ways in</H2>
      <P>If you already have a wallet, sign in with Tempo Wallet, a browser wallet, or WalletConnect instead. Trading works the same way. Of the two ways to tap with no prompt, the wallet key needs a passkey account; a Trading Balance session works with any of them.</P>
      <H2>Money</H2>
      <Ul
        items={[
          <>Everything is in pathUSD, Tempo&apos;s dollar stablecoin: stakes, payouts and the network fee.</>,
          <>On testnet, <b>Add money</b> mints testnet pathUSD from the faucet into your account. The faucet has a cooldown, and Add money says when you can claim again.</>,
          <>Your <b>wallet</b> is your account itself. Your <b>Trading Balance</b> is a vault you own on Tempo that holds money and positions for you, so one key can tap from it with tight caps and a keeper can run your exits (<A href="/docs/one-tap">one-tap</A>, <A href="/docs/exits">exits</A>). Only you can withdraw from it.</>,
        ]}
      />
      <Note>Testnet pathUSD has no value. Never send real funds to a testnet address.</Note>
    </>
  );
}
