// /docs — the introduction (S20, L-20): what Mitoshi is, what is live on Tempo testnet, what is next.
import type { Metadata } from "next";
import { A, H1, H2, Lead, Note, P, Ul } from "@/features/docs/Prose";

export const metadata: Metadata = { title: "Docs" };

export default function Page() {
  return (
    <>
      <H1>Mitoshi docs</H1>
      <Lead>Mitoshi 見通し — &ldquo;see where it&apos;s going&rdquo; — is a one-screen app for calling where a price closes, on Tempo. These pages document what runs today on Tempo testnet; what comes next is said to be next.</Lead>
      <Note>Mitoshi runs on Tempo testnet (Moderato). The dollars are testnet pathUSD from the faucet and have no value. Everything else is real: the order books, the signed prints, the settlement and the receipts.</Note>
      <H2>Live on testnet</H2>
      <Ul
        items={[
          <>The <A href="/docs/terminal">terminal</A>: a live price line, the Window on screen, UP and DOWN, CLOSE, positions, history and activity.</>,
          <>Sign-up with a <A href="/docs/account">passkey</A>, testnet dollars from the faucet, and <A href="/docs/one-tap">one-tap trading</A> with no prompt per tap.</>,
          <>Windows on BTC, ETH, SOL and nine US stocks (<A href="/docs/windows">lanes</A>), settled on RedStone&apos;s signed prints (<A href="/docs/settlement">settlement</A>).</>,
          <><A href="/docs/exits">Take-profit, stop-loss and trailing stops</A> that a keeper sells with the app closed.</>,
          <><A href="/docs/games">Range, Moonshot, Parlay and Boost</A>, priced against the same books and the maker vault&apos;s depth.</>,
          <><A href="/docs/record">The record and its proof</A>: each Window&apos;s prints re-verified in your browser, proof of demand, the leaderboard and profiles, Trader Edge, and share cards.</>,
        ]}
      />
      <H2>Next</H2>
      <P>Tokenized stocks to hold and trade on Tempo: their pools and price guard are deployed on Moderato (<A href="/docs/contracts">contracts</A>), and the screens are being built. Then the same contracts and keepers on Tempo mainnet.</P>
      <H2>Start</H2>
      <P>Open <A href="/trade/BTC">the terminal</A>, sign up with a passkey, take testnet dollars with Add money, and tap UP or DOWN. <A href="/how-it-works">How it works</A> walks through a payout.</P>
    </>
  );
}
