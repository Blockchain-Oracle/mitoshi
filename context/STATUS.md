# STATUS — the resume pointer (read this first)

Updated 2026-09-29 by Claude, after the UX-first re-plan (plan v5). **Never trust memory over this file.** Update it at the end of every session.

> **Build time (from 2026-09-29): the resume pointer is `docs/plan/STATUS.md`** (read after
> `docs/plan/working-rules.md`). Plan v5 was approved on 2026-09-29 and copied to `docs/plan/00-plan.md` (specs in
> `docs/specs/`, decisions D-001…D-057 and questions Q-001…Q-031 in `docs/plan/decisions.md`); **S0 — Bootstrap is in
> progress** on `stage/S0-bootstrap`. This file stays as the pre-build context map below.

## What this is

Colosseum **Crypto World's Fair** entry, **Tempo track**. One product, two equal pillars:
**prediction markets** (Masayume/Agari fidelity port, crypto + stocks, pathUSD) and **stocks on
Tempo** (real Robinhood Stock Tokens bridged to Tempo + themed AI portfolio strategies). Plus stablecoin and
memecoin launchpads. *Superseded 2026-10-13 by D-231: no bridge; stocks are Windows (calls), themes trade them.*

## State

Research, fidelity and architecture documents only. **No code, no new git commits this session.**
Decisions 1–9 in `04-decisions-and-rules.md`.

| Step of the owner's plan | State |
|---|---|
| 1. Understand the project | Done |
| 2. Fidelity — one combined ledger, reusing existing work | **Done:** `tempo/12-parity-ledger.md`, built from `tempo/fidelity/masayume-side.md` and `tempo/fidelity/agari-side.md` |
| 3. Research the open items | **Done:** `13` Uniswap v4 + TIP-20, `14` bridge + Robinhood tokens, `15` equity prices, `16` tempo-std/apps/primitives |
| 4. Architecture | **Done:** `tempo/17-architecture.md` |
| 5. Build plan | **v5 approved** (2026-09-29): `docs/plan/00-plan.md` — UX-first, 21st.dev components revamped, performance budgets, library docs via Context7, mobile SM1–SM5; specs in `docs/specs/`. S0 in progress (`docs/plan/STATUS.md`) |

## Read order for a fresh session

1. This file.
2. `05-product-vision.md` — what the owner wants, in his words.
3. `04-decisions-and-rules.md` — decisions, pins, standing rules (corrected 2026-09-21).
4. `tempo/17-architecture.md` — the design.
5. `tempo/12-parity-ledger.md` — every capability, its reference and its Tempo implementation; §12 owner decisions.
6. Research: `tempo/13` (v4 + TIP-20), `tempo/14` (bridge), `tempo/15` (prices), `tempo/16` (Tempo primitives).
7. Evidence behind the ledger: `tempo/fidelity/masayume-side.md` (contracts, DreamDEX interface, decisions by
   provenance, acceptance criteria) and `tempo/fidelity/agari-side.md` (engine spec E-01…E-72, decisions, stock rules).
8. Background: `tempo/09`, `10`, `11`, `06`, `02`, `00`, `01`; `00-hackathon-brief.md` (rubric, two videos).
9. 2026-09-29 research for plan v5: `tempo/research-2026-09-29/` — `ux-audit.md` (reference flows, fixes, keep-list),
   `21st-map.md` (a 21st.dev pick per surface), `web-stack.md`, `chain-libs.md`, `mobile-stack.md` (Context7 docs →
   decisions).

Tempo docs: 227 pages on disk in `../reference/tempo-docs-md/` — grep there first.

## What the research changed (2026-09-21)

- **Access keys are live and tested**, but their limits don't count contract `transferFrom` and recipient binding covers
  only TIP-20 transfer/approve → contracts pay `msg.sender` only and caps live on chain. Only EOA-style
  accounts can grant keys → themes use per-user accounts. **Corrected 2026-09-29:** EventVault is ported as-is (caps in
  the vault) and theme caps live in the ThemeRouter follow record — no KeyPolicy contract (D-002, D-003).
- **Deploys cost ~$0.015 per max-size contract**; the constraint is block space (30M gas/block general lane; 250k gas per
  new slot) → recycled order nodes, packed positions.
- **Fee sponsorship needs no approval** when we run our own relay.
- **Prices:** no push equity feeds on Tempo; RedStone pull (free) + Chainlink Data Streams (paid, mainnet) verify on chain;
  Pyth is unusable; Tempo refuses value transfers.
- **Bridge:** LayerZero Robinhood↔Tempo works on mainnet with explicit DVNs; testnet needs a Base Sepolia hop; no CCIP lane.
  195 Stock Tokens incl. GLD. Precedent: USDC.e/USDT0/frxUSD are TIP-20s minted by a LayerZero adapter. *(Superseded
  2026-10-13 by D-231: the bridge left the product.)*
- **Wallet UI:** RainbowKit 2 can't run on wagmi 3 (needed by Tempo's connectors) → Agari's replica modal.
- **SpaceX is listed** (SPCX), not pre-IPO.
- **Uniswap v4:** official mainnet deployment in real TIP-20 use; Moderato needs our own deploy (BUSL allows testnet);
  payouts must pre-check receive policies (else funds strand in the ReceivePolicyGuard); passkeys can't sign permits;
  memecoins graduate into hookless pools; the stock guard is a static-fee hook (**corrected 2026-09-29:** flags `0x20C0`,
  beforeInitialize + beforeSwap + afterSwap; Moderato = replay of 7 mainnet CREATE2 txs; UR `0xa2dc…ea91` pinned).

## What the 2026-09-29 re-plan changed

- Owner answer 9: keep Masayume's look and every flow; new surfaces and weak-UX ported screens are rebuilt from
  21st.dev components restyled to Masayume's tokens. Owner overlay rule (Masayume ledger 2026-09-04): centred modals and
  the right-edge slide-over, no bottom sheets — the app's More panel slides from the right.
- UX: one passkey ceremony to a funded, tap-ready account; a wallet-mode access key for no-prompt taps alongside the
  Trading Balance; verdict pinned to the position; one real-time stream; a shared transaction-state model; a key and
  grant manager in `/settings/account`.
- Performance: budgets in CI (≤ 250 KB gz JS on app routes, LCP ≤ 2.5 s, INP ≤ 200 ms); Next 16 cache components +
  React Compiler; route-group provider split.
- Library docs forced fixes: SSTORE2 writes root-key only; ThemeRouter `sync` before settle; OZ 5.6 proxy init at
  construction; Foundry `network = "tempo"`, gas snapshots, `afterInvariant`; wagmi 3 renames; mobile shell details.
- Tests prove functionality; they are not a deliverable.

## Open decisions (owner)

Superseded at build time by the Q-entries in `docs/plan/decisions.md` and `docs/plan/owner-actions.md` (several below
are now answered: source chain D-001, theme model D-002, repository D-004). Kept as the 2026-09-29 snapshot.

Full list: `tempo/12-parity-ledger.md` §12 and `tempo/17-architecture.md` §13. Headlines:

- Source chain Robinhood Chain (all research supports it) — confirm. *(Moot since D-231, 2026-10-13: no bridge.)*
- Theme account model (per-user recommended), AI's role in themes, themes and tickers, names for calls vs themes.
- Q0 agent ranking; settlement fee; open print before taker fills on chain.
- Y-rows to reopen (builder fees, mainnet funding, agent API).
- Testnet bridge route; pause propagation; personal eligibility and budget for mainnet Stock Tokens; Safes. *(The bridge
  and stock-token items are moot since D-231, 2026-10-13.)*
- Data Streams subscriptions + testnet credentials; RedStone licence; indexer route; idle-yield token.
- Yosuku CSS licence before a public repo; repository and product name; the pitch.
- Mobile: app name/bundle IDs (Q-027), geofence for App Review (Q-028), organization account later (Q-029), ask
  Colosseum about judges installing apps (Q-030); wallet access-key defaults (Q-031).

## Standing rules

Deadline is never a reason; never cut/defer/thin. Real integrations, no mocks, disclaimers instead.
Research and cite. No CLAUDE.md in the repo (and don't carry Masayume's `web/CLAUDE.md`/`AGENTS.md`). Check
provenance before calling inherited code "the owner's rule". Shijima is excluded. Details: `04-decisions-and-rules.md`
and the saved memories.
