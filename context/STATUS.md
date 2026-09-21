# STATUS — the resume pointer (read this first)

Updated 2026-09-21 by Claude, before the owner clears context to start a fresh session.
**Never trust memory over this file.** Update it at the end of every session.

## What this is

Colosseum **Crypto World's Fair** entry, **Tempo track**. One product, two equal pillars:
**prediction markets** (Masayume/Agari fidelity port, crypto + stocks, pathUSD) and **stocks on
Tempo** (real stock tokens + themed AI portfolio strategies). Plus stablecoin and memecoin launchpads.

## State

Research and documentation only. **No code, no git commits.** Decisions 1–9 in
`04-decisions-and-rules.md`.

## Read order for a fresh session

1. This file.
2. `05-product-vision.md` — what the owner wants, in his words.
3. `04-decisions-and-rules.md` — decisions, reference pins, standing rules.
4. `tempo/11-stock-strategies-architecture.md` — the new pillar: findings and open choices.
5. `tempo/05-agent-parity-ledger.md` — agent layer mapped to Tempo (incl. the ranking defect §4.1).
6. `tempo/09` (stock tokens), `tempo/10` (networks, pathUSD, no Circle USDC), `tempo/06` (bonding curve,
   Uniswap v4 correction), `tempo/02` (gap analysis), `tempo/00` + `tempo/01` (Tempo facts, MPP).
7. `00-hackathon-brief.md` — rules and the rubric that actually decides (startup rubric, two videos).

Tempo docs: 227 pages on disk in `../reference/tempo-docs-md/` — grep there first.

## Next session — the owner's plan (2026-09-21)

1. **Understand the project** from the read order above.
2. **Fidelity — reuse, don't redo.** Build one combined parity ledger for the Tempo product from the
   fidelity work that already exists:
   - **Masayume** (design authority, prediction pillar): `/Users/abu/dev/hackathon/sommina-events` @
     `68f7a09` — `docs/implementation/parity-ledger.md` (1,388 lines),
     `docs/architecture/yosuku-source-led-migration/00–06`, `docs/implementation/acceptance-2026-09-06.md`.
   - **Agari** (engine + stock markets): **read the worktree `/Users/abu/dev/hackathon/agari-wt/w1`**
     (branch `integration/w1`; it moves daily — `a442988` on 2026-09-21). The main `stocklana` checkout
     is on an old branch. Key files: `docs/plan/{parity,00-plan,decisions,STATUS,working-rules}.md`,
     `context/05` (Masayume parity inventory), `context/06` (DreamDEX engine spec), `context/08`
     (engine review, 26 corrections), `context/01`, `02`, `13` (stock issuers, oracles, price sources).
   - Add rows for what neither covers: stocks on Tempo, themed strategies, launchpads.
3. **Research the open items** (sources, not guesses): Uniswap v4 source + hooks (open source);
   TIP-20 behaviour in v4 pools; LayerZero OFT Adapter and CCIP endpoints on Robinhood Chain testnet +
   Tempo testnet; equity price coverage on Tempo (RedStone, Chainlink); Robinhood's mainnet Stock Token
   list and a gold ETF token; ERC-8056; Tempo's `tempo-std` and `tempo-apps`.
4. **Design the architecture** for the whole product.
5. **Plan mode** → the build plan (every contract/service/surface, in order; full scope).

## Open decisions (owner)

- Source chain for stock tokens — Robinhood Chain (recommended) or xStocks/Solana.
- Tempo-side stock token — TIP-20 or plain OFT.
- Theme account model — per-user account or pooled vault per theme.
- AI's role in themes — choose weights, or execute/time a fixed allocation.
- Themes and tickers.
- Names for the two kinds of "strategies".
- Agent ledger §6: ranking fix (Q0), where the three market caps are enforced, reputation write cadence,
  who pays for MPP inference, public research receipts vs. edge.
- The pitch.

## Standing rules

Deadline is never a reason; never cut/defer/thin. Real integrations, no mocks, disclaimers instead.
Research and cite. No CLAUDE.md in the repo. Check provenance before calling inherited code "the owner's
rule". Shijima is excluded. Details: `04-decisions-and-rules.md` and the saved memories.
