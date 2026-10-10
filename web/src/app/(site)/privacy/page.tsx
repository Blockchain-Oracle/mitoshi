// /privacy (S20; "/privacy and /terms reuse the docs layout"): what Mitoshi keeps, from what the code stores — the
// passkey credential and session (auth-handler), the install id and hashed IP (server/request.ts), route-only vitals
// (D-071), the relay's ledger, and the per-request region read (server/region.ts).
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
      <H2>On chain</H2>
      <P>What you do on Tempo — your address, trades, balances and receipts — is public on the blockchain, as it is for everyone. Mitoshi&apos;s indexer reads that public record to show your positions and history, as anyone could.</P>
      <H2>Others involved</H2>
      <Ul
        items={[
          <>Tempo&apos;s RPC receives the transactions you sign.</>,
          <>Prices reach your browser from Mitoshi&apos;s own servers, which fetch them from RedStone and the display feeds.</>,
          <>If you sign in with Tempo Wallet or WalletConnect instead of a passkey, that provider handles your sign-in under its own policy.</>,
        ]}
      />
      <Note>Mitoshi runs on Tempo testnet. It handles no real money.</Note>
    </DocsLayout>
  );
}
