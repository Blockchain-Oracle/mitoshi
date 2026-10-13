# MITOSHI — DEMO SCRIPT

One story, in the order a new user meets it. Screen notes are in [brackets]. Don't read them.
Lines in (round brackets) are alternates: say one only when the screen shows that state.
Just under 3 minutes: 539 spoken words at about 185 a minute (2:55), plus two two-second holds on the proof.
App: https://mitoshi.xyz · Docs: https://docs.mitoshi.xyz

Checked against the code on `integration/t1` (f35d28d5) and the live app (web build 20261013142525) on
13 October 2026, 14:00–14:45 UTC. **R6** marks a shot that waits on a round-6 fix (D-230,
`docs/plan/owner-plan-r6-2026-10-13.md`). Record those shots last. The full list is at the bottom.

## 1 · OPENING

   [mitoshi.xyz, dark theme. The hero: "See where it's going. Call the close.", with the live terminal on the phone
   beside it. Hold one second before speaking. R6 #10: record after the landing revamp lands. Say the tagline as
   written even if the revamp changes the headline.]

See where it's going. Call the close.

Meet Mitoshi: prediction markets and stocks on one screen, powered by Tempo.

## 2 · THE PROBLEM

   [Stay on the hero. The phone's line keeps moving.]

Just a quick question. Five minutes from now, is Bitcoin higher or lower?

Most of us have a hunch. Almost nobody acts on it.

Up-or-down markets are not new, I know that. Polymarket and Kalshi already run them. But on chain, one call is
still paperwork: a wallet, a gas token, a prompt for every click.

## 3 · THE SOLUTION

   [Hover "Start trading".]

So I built Mitoshi. Watch the live price, tap UP or DOWN, and a signed price settles it on Tempo.

Let me show you, from the very start.

## 4 · THE TERMINAL

   [Click "Start trading" → /trade/BTC. Skip the tour. Point at the marked "Line" on the chart, then the Window
   chip ("5m · trades 3:40"). The DEMO plate reads "Paper dollars". R6 #1 and #4: the chip must read
   "trades m:ss", never "pricing…" or "no Window".]

This is the terminal. The line is Bitcoin, live. This mark is where the Window opened: UP wins if it closes at or
above it. The chip says how long it trades.

(If it's waiting for its opening price: "If the opening price isn't signed yet, it says so, and counts down.")

Signed out, it trades on paper. I want the real thing.

## 5 · SIGN UP

   [Rail, bottom left: "Sign in" → "Create account" → Touch ID. The "You're funded" card → "Let's go". The plate
   now reads TESTNET. On a phone, say "My face" instead.]

Sign in. Create account. My fingerprint. That's my account on Tempo. No seed phrase, no gas token.

And a million test dollars just landed.

## 6 · THE FIRST CALL

   [Rail: Trade settings → Size → $5, then close the drawer. The default stake is 5 % of the balance, $50,000 on
   a new account. BTC 5m with at least 3 minutes to trade. Tap UP → the passkey sheet → Touch ID. The row reads
   "Confirming on Tempo…", then the booked position. The toast "One-tap is off · Turn on" → "Turn on" → hold on
   "What you are signing" (Can · Never · Limit · Fees) → "Arm tap-trading" → Touch ID → "Tap-trading is on."
   R6 #2: UP must fill at $5.]

Five dollars, UP. The first trade asks for my fingerprint, once. There it is.

(If the book is thin: "If the book can't fill my size, it offers the size that does.")

Then it offers one-tap: up to twenty-five dollars a day, for twenty-four hours, and it can never withdraw my money.
One more fingerprint, and that's the last prompt.

## 7 · ONE TAP

   [Asset chip → ETH → 5m. Tap DOWN. No prompt. Toast "DOWN ETH opened" → "Receipt" → the cream receipt, with
   "Signed by your trading key" → click the transaction → Tempo's explorer. Point at From (your address), then Fee
   Payer 0x3d77…c5f1 and Transaction Fee in PathUSD. Hold two seconds. R6 #3: say "in under a second" only if the
   take shows it. Otherwise drop those four words.]

Now watch this. Ethereum, DOWN. No prompt. It's there in under a second.

Let's confirm. On Tempo's explorer: from my account, and the fee payer is Mitoshi's relay. A fraction of a cent,
and I didn't pay it. It matches.

## 8 · CLOSE IT, OR SHARE IT

   [Back on the terminal. The ETH position's value rides the line. Tap CLOSE → "Closing…" → "Closed ETH ·
   Realized … paid". Open the BTC position → "Share" → the card (PnL · ROI) with its link and QR, then close the
   card. Open the BTC position → "Proof" in a new tab and keep it for part 9. R6 #2: CLOSE needs a bid on the
   book.]

The number on the line is what CLOSE pays. One tap, sold back to the book.

The Bitcoin one, I'll hold. And sharing a call is one tap.

## 9 · THE CLOSE, PROVEN

   [Cut ahead to the BTC Window's close: the settle toast. Switch to the proof tab and reload: the open and close
   prints from RedStone, "5 signers", the Result. Click "Re-verify". Hold on "Close · record tx · matches" and
   "Close · archive · matches". Fix first: every Window reads "Re-verified: 2 of 3 pass" today (see the bottom).]

When the Window closes, RedStone signs the price, and winners are paid automatically.

Let's confirm. The Window's proof: the opening print, the closing print, five signers. Re-verify runs in my own
browser, from the chain. It matches. You don't have to trust me.

## 10 · STOCKS

   [Markets → NVDA (or TSLA). Point at the session cell ("Open · closes 16:00 ET") and the 24/7 chip. Tap UP once:
   no prompt. Then More → Bridge (Robinhood → Tempo), and More → Themes. R6 #5 and #6: show Bridge and Themes only
   once a bridge in and out is proven and the themes no longer read "Paused". Until then, cut the second paragraph.]

Same two buttons on stocks. NVIDIA, Tesla, Apple: in market hours, and around the clock.

And stocks you can hold. Robinhood's stock tokens bridge to Tempo, and a theme is a basket an agent rebalances in
your account.

## 11 · AGENTS

   [Automate → Agent leaderboard → "House agent: BTC reader" → Decisions: the latest one, called or held, with its
   quoted reason. Then "Copy" → a budget → "Copy" → one transaction → "Copying." R6 #9: the cockpit shows the
   countdown to the next read and real decision counts. Don't open agent #2 until then.]

Rather not watch the chart? Copy an agent. This one calls Bitcoin with a language model, and shows its reason, even
when it holds. Its limits are on chain. One transaction to copy, one to stop.

## 12 · EVERYTHING ELSE

   [Fast cuts, about a second each: Leaderboard (All time · P&L) → Range (the band on the BTC chart) → Boost →
   Parlay → Games (Line Rider) → Earn ("Earn the spread.") → Launch → mitoshi.xyz/download on a phone. R6 #8: the phone shot shows the TestFlight and Play links once /download lists
   them. Range needs the maker vault's depth ("Book too thin" until then).]

And there's more: the leaderboard, Range, Boost, Parlay, games, Earn, launchpads, and your phone. Let me not read
them all out. They're in the app, and in the docs.

## 13 · UNDER THE HOOD

   [docs.mitoshi.xyz → Under the hood → "How Mitoshi fits together". Scroll the "A Window on Tempo, from tap to
   payout" diagram slowly, from 01 Your account to 02 Venue operation.]

Under the hood, it's all Tempo. Tempo gave money a passkey. Access keys carry limits the chain enforces, and
someone else can pay the fee, in dollars.

And you don't even need our app to get paid. If our servers stopped tomorrow, anyone could still post RedStone's
prints and settle.

## 14 · THE DOCS

   [docs.mitoshi.xyz home → "Make your first call" (its recorded walkthrough) → "Who can do what" → "Deployed
   addresses". R6 #7: docs.mitoshi.xyz must serve with a valid certificate.]

Want to know how it all works? It's in the docs: diagrams, who can move your money, guides recorded on the live
app, and every contract address. Docs dot mitoshi dot x y z.

## 15 · CLOSE

   [Back to the mitoshi.xyz hero. Hold on the headline after the last word.]

It's live right now. Open mitoshi dot x y z, sign up with your face, and the test dollars are on us.

See where it's going. Call the close.

---

## Shots that wait on round 6 (record these last)

State read on 13 October 2026 at about 14:40 UTC.

| Part | Needs | State now |
| --- | --- | --- |
| 1, 15 | #10: the landing revamp | The current hero works. The revamp hasn't landed |
| 4 | #1: a countdown to the opening print; #4: no "pricing…" chip | Neither has shipped. A Window that waits for its print shows "Waiting for the opening print" with UP/DOWN disabled |
| 6, 7, 8 | #2: the house quotes both sides with depth, and a thin book offers the size that fills | seed-maker quotes 38 of 76 open Windows. NVDA 5m showed UP "max $1.52". BTC 5m showed "No liquidity at this size" |
| 7 | #3: "Getting a price…" made fast | Measured at 0.64 s p50 on 9 October (S23). The owner sees it slow now |
| 10, second paragraph | #6: a bridge in and out; #5: themes fast and live | Bridge: "Robinhood side not live". Themes: all three read "Paused · stock prices halted" |
| 11 | #9: real decision counts and a real countdown | #3 is fine: 20 decisions, the latest held with its reason. #2 reads "Decisions 0" and "NEXT READ 29865024:42" |
| 12, phone | #8: /download with TestFlight and Play links | /download reads "iOS and Android builds are in progress" |
| 13, 14 | #7: the docs on their own domain | docs.mitoshi.xyz answers 503 behind Traefik's default certificate. docs.testnet.mitoshi.xyz still serves |

The voice can be recorded now. Record parts 4–10 in one sitting once their rows clear, so one account carries the
whole journey.

## Before you record

- **mitoshi.xyz serves the app.** It has since build 20261013142525, and testnet.mitoshi.xyz 301s to it.
  **docs.mitoshi.xyz must serve with a valid certificate** before parts 13 and 14.
- **The proof's re-verify reads every row as passing.** Today every Window's open is the previous Window's close.
  The open row reads "can't check · Previous Window's close", so the verdict reads "Re-verified: 2 of 3 pass". Checked on
  30 Windows that settled at 14:15 UTC (`web/src/features/proof/ProofVerify.tsx`, the `copied` row). Fix it to check
  the previous Window's close record, or don't record part 9.
- **ops is healthy:** https://ops.mitoshi.xyz/health shows every actor ok. spot-feed reads "19/19 feeds", so you
  aren't inside a RedStone refusal window (D-210). seed-maker and earn-quoter quote every listed Window.
- **The public RPC isn't limiting your IP.** If the terminal sits on "Connecting…" or "Syncing the chain clock…" with
  429s in the console, wait a minute and reload. A provider RPC (`TEMPO_RPC_HTTP_URL`) removes this.
- **Use a fresh browser profile with no Mitoshi passkey**, so part 5 is a real first sign-up. The faucet funds each
  account once a day, and ten accounts per IP address a day.
- **Set Size to $5 before the first tap.** The default stake follows 5 % of the balance: $50,000 on a new account.
  One-tap then caps each tap at what is left of its $25 a day.
- **Start part 6 with 3 or more minutes left** on the BTC 5m Window, so it settles inside one cut. Part 7 needs an
  ETH 5m Window trading.
- **For part 10, record in NYSE hours** (13:30–20:00 UTC), or on a stock's 24/7 lane outside its 04:00 ET pause. AMD
  and PLTR have no 24/7 lane. NFLX is paused.
- **House agent #3 has a decision from the last few minutes** (its Decisions tab).
- **Use the dark theme and turn the terminal's music off** (⋯ → Music). Dismiss the "How the terminal works" tour
  once, before you record.
- **Time the take.** If it runs past 3:00, cut part 10's second paragraph first, then part 4's last two sentences.

## Fallback proof, if a take fails

- The relay pays the fee. The fee payer is `0x3D7791BAa66d34804f1769955fBf83AC576AC5f1`, S0's relay-fee-payer key.
  A user's BTC 5m call at 14:06 UTC on 13 October paid a fee of 0.000104 pathUSD:
  https://explore.testnet.tempo.xyz/tx/0xe9c0e5c4e396d8cc8fcf6d5bb884cd3501052db4d424091ca5e3ef30471e26ab
- A one-tap UP with no prompt, then CLOSE in one tap (TSLA, 9 October):
  https://explore.testnet.tempo.xyz/tx/0x1c724ecc9c553d32a9499f0ec083b846e6791716f4171e572afd13b603309feb ·
  https://explore.testnet.tempo.xyz/tx/0xd7333b4d015980064e0dab6ca423779c1ca5548aeb433123b570c98bce5f61fd
- A stop-loss sold by the keeper with the tab closed:
  https://explore.testnet.tempo.xyz/tx/0xa5ddbcea7fd0ce01bd5159c939f219784effd52217d4392f3286326d9c1436aa
- A settled Window's proof (META 15m, DOWN, 5 signers):
  https://mitoshi.xyz/proof/0xa7d7ca42c7c9236bfa57321c22bfdce1cc46d17500708426acbda95b54d45ae7
- EventsEngine is `0x113Ca86bE942671E5290Ed57d86297F0Ecd61b6a`: every call's pathUSD goes to it.

Each transaction above read status 1 on Moderato on 13 October. The links use testnet's explorer, the one the app
links to.

## Left out on purpose

- **Trade from X:** the x-relay can't read mentions. X's API answers 402 until the app buys credits, and no person
  has posted a call on X yet.
- **Exits with the app closed:** they run only for a Trading Balance position. This story uses the wallet's one-tap
  key, so its TP / SL run while Mitoshi is open.
- **The private desk:** no private bet has been placed through the browser yet.
- **Also left out:** the Memory Market (MPP), Sensei, Reels, News, Duel, the season league, Trader Edge and the
  status boards. They're in the app and the docs, and the montage stands for them.
