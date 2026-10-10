# Colosseum Crypto World's Fair — submission draft (Tempo track)

Draft for the owner to review and paste into the form (due 2026-10-12 23:59 PT). Every product claim below is live on
Tempo testnet and evidenced in `docs/plan/acceptance/` unless it says "deployed" (contracts on Moderato, no screen yet)
or "next". Fields only the owner can fill are marked **[owner]**.

## Product name

Mitoshi (見通し — "outlook", "seeing where it's going")

## One line

Call where a price closes, on Tempo: one screen, a passkey, one tap.

## Description

Mitoshi is a one-screen trading app for short-term price calls on Tempo. You see a live price line and the Window on
screen — BTC, ETH and SOL every five minutes around the clock, nine US stocks in and out of NYSE hours — and tap UP or
DOWN. Each Window has its own on-chain order book and settles on RedStone's signed prices, verified on chain; a tie
goes UP, and a Window with no reliable print is voided at half.

Tempo's account primitives make it one tap: a passkey is the account (no seed phrase, no extension), one more
biometric publishes an access key with a daily limit, and every trade after that signs itself while Mitoshi's relay
pays the network fee in dollars. On testnet the median from press to position is 0.64 s with no prompt. CLOSE sells in
one tap at what the line shows, and take-profit, stop-loss and trailing exits are sold by a keeper with the app
closed. Range, Moonshot, Parlay and Boost price against the same books and a maker vault's depth.

## Blockchains and tools integrated

- **Tempo** (Moderato testnet, chain 42431) — live: passkey (WebAuthn P-256) accounts, access keys
  (AccountKeychain) for one-tap trading, fee sponsorship through our own relay (fee payer), pathUSD (TIP-20) as the
  only money, Tempo transactions with batched calls; the market engine, Trading Balance vault, maker vault and game
  reserves are our contracts on Tempo.
- **RedStone** — live: signed price packages for every Window's opening and closing print, verified on chain by our
  print verifier.
- **Uniswap v4** — deployed: stock pools with a guard hook (screens next).
- **LayerZero** — deployed: the bridge contracts for stock tokens from Robinhood Chain (not live yet).
- Tools: Foundry, Next.js 16 / React 19, viem and wagmi with Tempo support, the Tempo accounts SDK, Postgres
  (indexer), self-hosted on Coolify.

## Links

- App: https://testnet.mitoshi.xyz (the terminal: https://testnet.mitoshi.xyz/trade/BTC)
- Pitch: https://testnet.mitoshi.xyz/pitch · Demo walkthrough with on-chain receipts: https://testnet.mitoshi.xyz/demo
- Docs: https://testnet.mitoshi.xyz/docs
- Logo: `web/public/icon-512.png` (the mark), `web/src/app/icon.svg`
- Repo: `Blockchain-Oracle/mitoshi` — **[owner]** private: give `hackathon@colosseum.com` read access, or make it public.

## Team

**[owner]** names, backgrounds and location. (The pitch folio's builder slide reads: Abubakr Jimoh, also known as
Blockchain Oracle.)

## Videos

- 2–3 min presentation: `docs/submission/pitch-script.md` (over `/pitch`, then the live product). **[owner]** voice.
- ≤ 3 min product demo: `docs/submission/demo-script.md`, cut from the recorded footage. **[owner]** voice.

## Go-to-market, demand, distribution

**Insight.** Up-or-down price calls are a staple format of prediction markets, but on chain every call
has meant a wallet, a gas token and a signature per click. Tempo removes all three at the protocol level — passkeys,
access keys inside limits, fees in dollars paid by whoever chooses to — and Mitoshi is built around that: the product
is one screen and the trade is one tap that lands as a confirmed position in under a second.

**Who it's for.** People who already check a price on their phone and have an opinion about where it goes in the
next five minutes — crypto-curious traders and stock watchers — who will not install an extension or buy a gas token
to say so.

**Distribution.**
- Every Window has a link (`/trade/BTC?w=…`) that opens the terminal on it, ready to tap — built to be shared where
  people already talk about prices (X, Telegram, group chats).
- An installable web app (no store), so a link becomes a home-screen app in one step.
- The Tempo ecosystem: Mitoshi is a consumer app that exercises Tempo's account and payments primitives end to end.

**Demand validation — where it honestly stands.** We have not run an external user cohort yet. What is validated is
that the product works end to end on Tempo testnet with real contracts: the indexer counts tens of thousands of
Windows opened and resolved on their signed prints, and live runs from fresh accounts — sign-up, taps, closes,
exits sold with the tab closed, Range and Moonshot — are recorded with their receipts on `/demo`. Next: a public
testnet beta from the shared Window links, measuring sign-up → first tap and return visits.

**Business model.** No trading or settlement fee today. The venue's makers — the house maker and the maker vault,
whose suppliers share its result — quote both sides around a fair-value model and earn the spread on the flow; Boost
charges a premium for the reserve's front. Fees, if any, come later and only with volume.

## Pre-existing code (disclosure)

As in the README: this entry ports code the owner wrote before the hackathon — Masayume (`68f7a09`, contracts,
packages, web), Agari (engine semantics rewritten in Solidity, the ops runtime), Owarine (`ecb7565b`, the terminal)
and Baku (`ede3ed38`, the shell) — and marks every ported file with its source and commit. Tradash is a behaviour
reference only (nothing copied); 21st.dev components and other third-party material are listed in
`THIRD_PARTY_NOTICES.md`. New for this hackathon: the Tempo engine and product contracts, the stock contracts, the
launchpads, the wallet/relay/passkey layer, the ops keepers, the terminal and the UX rebuild; the git history shows
what was built when.
