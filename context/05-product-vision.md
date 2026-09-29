# Product vision — in the owner's words

The north star for the fidelity pass, the architecture and the plan. Captured 2026-09-21 from the
owner's direction. Where later sessions interpret, they check back against this.

## Two pillars, equal weight

> "I don't want it to be like prediction market is taking the full picture… It's both of them."

### Pillar 1 — Prediction markets (fidelity port)

- Bet **pathUSD** on whether a price goes **up or down** within a time Window; get paid in pathUSD.
- On **crypto (BTC…) and stocks** — stocks "the same way as Stocklana (Agari)."
- **The full Masayume product**: AI agents that make calls with **strategies other people can copy**,
  Parlay, Range, Boost, Private desk, Earn, all six games, trading from X, Sensei, Reels, rooms.
- Code exists and works (Masayume on Somnia, Agari on Solana), so this pillar is a **fidelity port**.

### Pillar 2 — Stocks on Tempo (new)

> "We are building a stock on Tempo. We should be proud of that. We should be able to promote that,
> that stocks now exist on Tempo."

- **Real stock tokens on Tempo** — bridged/mirrored from a chain where they exist (Option A approved).
  Users can **buy stocks** in the app.
- **Themed strategies users scroll through** — "these AI stocks, these gold stocks…"; energy, finance,
  AI full stack, digital, gold (Glider's ecosystem as the reference for the shape).
- **"You can use your AI agent to trade on these stocks… on Tempo."** An agent trades a theme's
  portfolio for the user — a rebalancer, **not** a prediction market.
- No existing code — this pillar needs research-driven architecture.

### Also in the product

- **Launchpads**: stablecoins (TIP-20 Factory → enshrined DEX) and memecoins (bonding curve →
  Uniswap v4 pool).
- **Earn**: market-making capital, plus yield-bearing dollars for idle balances.

## Standards

- **Real integration, never mocks.** "It's not mocked… because then what's the point?" A disclaimer
  (prototype, unaudited, not an offer) replaces fakes. No paper/simulated backing.
- **Testnet and mainnet** both. Mainnet shows judges "I took this very far." pathUSD is the unit.
- **Research before claiming.** "Research only steps you a step further… if you're trying to
  hallucinate we won't get anywhere." (The Uniswap v4-on-Tempo find is the example.)
- **Full scope, the deadline is never a reason** (Agari D-113).
- **Fidelity where code exists; reuse the fidelity work already done** in `sommina-events` and Agari
  rather than redoing it.

## 2026-09-29 — UI direction and standing instructions

- **Owner answer 9 (D-009): keep Masayume's look, revamp the UX.** Masayume's identity (colours, type, nav, layout) and
  every flow stay; new surfaces (stocks, bridge, reserves, themes, launch, settings, mobile) are built from 21st.dev
  components restyled to Masayume's tokens, and ported screens with weak UX are rebuilt from 21st components too.
- **Standing instructions** (applied to every stage of the build plan): UX matters "1,000%"; search 21st.dev for the right
  component and revamp it — don't design components from imagination; "understand the libraries" means reading their docs
  through Context7 and following the recommended patterns; architect for performance; tests are not a deliverable but are
  written to prove important functionality works. Overlay rule (owner-directed, Masayume ledger 2026-09-04): centred
  modals and the right-edge slide-over, no bottom sheets.
- Recorded in `docs/plan/decisions.md`; the UX system is `docs/plan/00-plan.md` §2–§3 and `docs/specs/ux.md`.

## Open naming question

"Strategies" currently means two different things: **copyable prediction agents** (Masayume) and
**themed stock portfolios** (Glider-style). They need distinct names in the product so users (and
judges) can tell them apart — e.g. "calls" vs "themes". Owner to choose.

## Pitch (not decided)

Draft direction only: *stocks and prediction markets, now live on Tempo* — with the "first stocks on
Tempo" claim and the on-chain agent receipts (MPP) as the two proofs. To be written after the architecture.
