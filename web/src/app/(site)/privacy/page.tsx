// /privacy (S20; "/privacy and /terms reuse the docs layout"): what Mitoshi keeps, from what the code stores — the
// passkey credential and session (auth-handler), the install id and hashed IP (server/request.ts), route-only vitals
// (D-071), the relay's ledger, and the per-request region read (server/region.ts). S13 adds the social layer
// (`social/0001-0004`), Sensei's AI sharing (`/api/sensei`, consent first), device-only alerts and topics, `/contact`,
// and the download and deletion in `/settings/account` (`/api/account/data`).
import type { Metadata } from "next";
import { DocsLayout } from "@/features/docs/DocsLayout";
import { H1, H2, Lead, Note, P, Ul } from "@/features/docs/Prose";

export const metadata: Metadata = { title: "Privacy" };

export default function Page() {
  return (
    <DocsLayout>
      <H1>Privacy</H1>
      <Lead>Mitoshi keeps as little as it can to sign you in, pay your fees and keep the venue fair. It has no ads, no third-party analytics and no tracking cookies, and it sells nothing.</Lead>
      <H2>What Mitoshi keeps</H2>
      <Ul
        items={[
          <><b>Your passkey&apos;s public key and credential id</b>, and the account address on Tempo that comes from it, to sign you in. The private key never leaves your device or password manager.</>,
          <><b>A session cookie</b> (<code>cwf_passkey</code>, 30 days) that backs the faucet claim and the live stream&apos;s ticket.</>,
          <><b>A random install id</b> your browser sends with fee-relay requests, so fee budgets can be kept per device. It isn&apos;t tied to your name or email — Mitoshi never asks for either.</>,
          <><b>The relay&apos;s ledger</b>: the network fees it paid for you, by account address and install id, to keep within its budgets.</>,
          <><b>IP addresses only as hashes</b>, to rate-limit the faucet and a few other endpoints.</>,
          <><b>Page-speed measurements</b> (load, input and layout timings) with the page&apos;s route only — no account, no address.</>,
        ]}
      />
      <P>Your country is read from each request to keep markets closed where they aren&apos;t allowed; it isn&apos;t stored against you.</P>
      <H2>What you post</H2>
      <Ul
        items={[
          <><b>Your public name and bio</b>, if you set them, shown on your profile and beside what you post.</>,
          <><b>Takes, room messages and reactions</b>: public, with your address. Words a filter matches are starred when shown; the original is kept.</>,
          <><b>Follows, blocks and the reports you file.</b> Who you block and what you report are never shown to the other person.</>,
          <><b>A social session cookie</b> (<code>cwf_social</code>, 30 days) when you sign in with a wallet instead of a passkey: one signature that lets this browser post as your address.</>,
          <>Reported posts are read by a moderator, who may hide them. Hidden posts stay stored until you delete your data.</>,
        ]}
      />
      <H2>Sensei and AI</H2>
      <P>Sensei sends nothing until you agree, and the agreement names who receives your question. When you ask, Mitoshi&apos;s server sends that provider your question, the conversation so far (up to 12 turns) and the figures on your screen: prices, the Window&apos;s line and each side&apos;s price, your open positions as amounts, your settled record and upcoming earnings dates. Never your address, keys, name or email. Mitoshi doesn&apos;t store the conversation; it stays in your browser tab. You can stop sharing from Sensei or from Settings → Account.</P>
      <H2>On your device only</H2>
      <P>Price alerts, notification choices, the AI agreement and display settings are kept in your browser&apos;s storage. Mitoshi&apos;s servers never see them.</P>
      <H2>When you contact us</H2>
      <P>What you send through the contact page is kept so someone can read and answer it: the topic, your message, an email only if you gave one for a reply, and your address only if you were signed in.</P>
      <H2>Download or delete</H2>
      <P>Settings → Account downloads everything Mitoshi keeps off chain about your account as one file, and deletes it: profile, takes, room messages, reactions, follows, blocks you made, reports you filed, game seats and contact messages sent while signed in. Deletion asks for a fresh signature and waits five seconds so you can undo. Blocks other people placed on you stay theirs.</P>
      <H2>On chain</H2>
      <P>What you do on Tempo — your address, trades, balances and receipts — is public on the blockchain, as it is for everyone. Mitoshi&apos;s indexer reads that public record to show your positions and history, as anyone could.</P>
      <H2>Others involved</H2>
      <Ul
        items={[
          <>Tempo&apos;s RPC receives the transactions you sign.</>,
          <>Prices reach your browser from Mitoshi&apos;s own servers, which fetch them from RedStone and the display feeds.</>,
          <>If you sign in with Tempo Wallet or WalletConnect instead of a passkey, that provider handles your sign-in under its own policy.</>,
          <>The AI provider Sensei names before your first question receives what&apos;s listed above, under its own API terms.</>,
          <>Your browser shows notifications only if you allow them; they are made on your device.</>,
        ]}
      />
      <Note>Mitoshi runs on Tempo testnet. It handles no real money.</Note>
    </DocsLayout>
  );
}
