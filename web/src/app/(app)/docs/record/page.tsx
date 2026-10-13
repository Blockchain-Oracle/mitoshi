// /docs/record — proof, stats, the leaderboard, profiles, Trader Edge and sharing (S5, L-20: only shipped surfaces).
import type { Metadata } from "next";
import { A, H1, H2, Lead, Note, P, Ul } from "@/features/docs/Prose";

export const metadata: Metadata = { title: "The record and its proof" };

export default function Page() {
  return (
    <>
      <H1>The record and its proof</H1>
      <Lead>Every number is read from the chain; the ones that settle money you can check.</Lead>
      <H2>Proof of a Window</H2>
      <P>Each Window has a <A href="/proof">proof page</A> (a position&apos;s details link to it): both prints with their signers and the transactions that recorded them, its outcome, its settlement and its timeline. One press of &ldquo;Re-verify&rdquo; runs two checks per print in your browser. The record check reads the print&apos;s transaction from Tempo (<code>eth_getTransactionByHash</code>), takes the signed RedStone packages out of its <code>recordPrint</code> call, and asks the on-chain print verifier for the price again (<code>eth_call verifyPrint</code>) — nothing comes from Mitoshi&apos;s servers. The archive check runs the same verifier on the packages Mitoshi archived from RedStone for that instant, apart from the transaction; for a Window that never got a print it shows what the archive held and why the verifier refused it — too few signers at that instant, for example. Each answer reads matches, differs or can&apos;t check.</P>
      <H2>Proof of demand</H2>
      <P><A href="/stats">Stats</A> counts the wallets that made a call, straight from the engine&apos;s fills: the calls, what changed hands, what was paid out, the growth by day, the venue&apos;s own counts and the latest calls with their receipts. It reads Mitoshi&apos;s index of the engine&apos;s events, refreshed every few minutes, and an independent replay of the chain recounts the same index.</P>
      <Ul
        items={[
          <>The house&apos;s keys (its maker, its taker, the maker vault) are never counted; its own fills are shown apart.</>,
          <>A tap from a Trading Balance counts for the wallet it was made for.</>,
          <>Calls taken by Boost, Parlay, Range or the private desk are counted as calls; their wallets aren&apos;t named yet.</>,
          <>On testnet, the wallets include the fresh passkey accounts Mitoshi&apos;s own end-to-end checks create.</>,
        ]}
      />
      <H2>Leaderboard and profiles</H2>
      <P>The <A href="/leaderboard">leaderboard</A> ranks wallets by what settled — P&amp;L or return on stake, daily, weekly, monthly or all time — with each wallet&apos;s rounds, win rate and best run. A round is one wallet in one Window: what came back (sold before the close, plus the settlement&apos;s payout on what was held) less what went in. Each row opens the wallet&apos;s profile: its figures, its tier and badges, and its latest settled Windows, each with its proof. The same board is in the terminal&apos;s account drawer.</P>
      <H2>Trader Edge</H2>
      <P><A href="/portfolio/edge">Trader Edge</A> turns your own settled Windows into a record: net result and return, win rate, profit factor, average Window, deepest slide, when in the day you do best, your payoff shape, your tier and badges, and a CSV of every settled Window at full precision. It is calculated in your browser from your fills and the settlement rule.</P>
      <H2>Sharing</H2>
      <P>A position&apos;s details have Share: a card with the call, its P&amp;L, its return or both, the price, and the terminal&apos;s link with a QR code, drawn in your browser. Download saves it (or opens your phone&apos;s share sheet); Share on X opens a post. Every terminal and every proof page also has its own link preview.</P>
      <Note>No tier pays a bonus or changes a fee.</Note>
    </>
  );
}
