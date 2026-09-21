# Decisions, pins, and working rules

The durable record: what was decided, what the references are pinned to, and the rules
for editing this repo without corrupting it.

## Standing rule — scope and the deadline

The owner's rule, stated 2026-09-18 and restated 2026-09-20 (Agari decision **D-113**,
`stocklana` `docs/plan/decisions.md`), and it applies here:

> The deadline is never a reason for anything and is never to be raised. Never cut, hide,
> defer or thin a feature; never take a page out of the nav instead of building it; never
> tell the user something "will not fit" or ask which features to drop. Every planned
> feature is built in full, to the same quality as the rest. When a list has unbuilt
> features, start the next one.

Sequencing work is allowed — ordering is not cutting. Anything in these docs that read as
a deadline-driven cut was withdrawn on 2026-09-21.

## Decisions (2026-09-17, scope corrected 2026-09-21)

1. **Track: Tempo.** $100k pool / 10 winners, EVM + TypeScript, thin field. Mainnet has
   been live since March 18, 2026 (chain ID `4217`) — production deployment is available
   as a traction claim.
2. **Scope: the full Masayume product on Tempo, plus the launchpads.** Every Masayume
   capability — markets, the agent/strategy layer and copy trading, Parlay, Range, Boost,
   Private desk, Earn, all six games, trade-from-X, Sensei, Reels, rooms — is built in
   full, in Masayume's visual/interaction language and information architecture, with
   Tempo-native implementations where Tempo offers a better primitive. Order of work is a
   sequencing choice, never a cut. (The 2026-09-17 wording made games/Parlay/Boost/Private/X
   a "pending slice"; that was framed around the deadline and is withdrawn under the
   standing rule above.)
3. **Launchpad: both stablecoin and memecoin.** Owner's decision, taken after the analysis
   in `tempo/02-idea-gap-analysis.md`. Both share one TIP-20 Factory issuance pipeline;
   the memecoin path additionally needs a bonding curve **and** a destination pool to
   graduate into, because the enshrined DEX reverts `ONLY_USD_PAIRS` on non-USD tokens.
   Design reference: `tempo/06-bonding-curve-design-reference.md` (Meteora DBC — Solana
   only, reusable as a specification, not as code).

4. **Markets cover crypto *and* stock prices** (2026-09-21), the Agari way: Up/Down Windows
   on a stock's price, bet and paid in stablecoins. Glider-style themed **plans** are presented
   through the agent strategy layer. Details: `tempo/07-stocks-plans-and-earn.md`.
5. **Stock tokens on Tempo are in this submission** (2026-09-21, owner): real integration — no paper
   money, no mocks — with a disclaimer (prototype, unaudited, not an offer). **Backing: Option A,
   approved** — lock real stock tokens on another chain and mirror them on Tempo. Recommended source
   (pending owner): **Robinhood Chain** (real testnet Stock Tokens via faucet; EVM both sides; LayerZero
   and CCIP on both chains). Venue: **Uniswap v4 on Tempo**. Design: `tempo/11-stock-strategies-architecture.md`.
6. **Both testnet and mainnet; pathUSD is the mainnet settlement unit** (2026-09-21, owner approved),
   accepting any USD stablecoin via the enshrined DEX; faucet pathUSD (or our own TIP-20 test dollar)
   on testnet. Circle USDC is **not** on Tempo — only bridged USDC.e. `tempo/10-networks-and-collateral.md`.
7. **Portfolio strategies are in scope** (2026-09-21, owner): Glider-style themed strategies (Energy,
   Finance, AI Full Stack, Digital, Gold…) that users scroll through, where an AI agent trades a
   stock-token portfolio for them. Not a prediction market. Engine to be designed in the architecture
   phase. Open design choices:
   `tempo/11-stock-strategies-architecture.md`.

8. **Shijima (`/Users/abu/dev/hackathon/open-serv`) is excluded as a reference** (2026-09-21, owner):
   don't cite, port or reason from it.
9. **Two equal pillars** (2026-09-21, owner): prediction markets *and* stocks on Tempo. The prediction
   market must not take over the product. See `05-product-vision.md`.

**Not yet decided:** the product thesis/pitch, and the Tempo port plan for the engine.
The engine *design* is no longer open — Agari built one (see pins below).
Open questions are listed in `tempo/05-agent-parity-ledger.md` §6.

## Reference products (pinned)

Prior work by the same owner. Treated as a **product baseline** under
`reference-product-fidelity`, not as a mood board — but see the warning below.

| Repo | Pin | What it is |
|---|---|---|
| `/Users/abu/dev/hackathon/sommina-events` | `68f7a09` (2026-09-10, `main`) | **Masayume** — price markets + games + agents on Somnia. 10 contracts. Built on **DreamDEX** |
| `/Users/abu/dev/hackathon/stocklana` — **read the worktree `/Users/abu/dev/hackathon/agari-wt/w1`** (the main checkout is on an old branch) | `integration/w1`, moves daily (`a442988` on 2026-09-21) | **Agari** — stock-price prediction market on Solana, source-led port of Masayume. **9 working Anchor programs incl. its own order-book engine (`agari-events`)**; parity 50 Done |
| `/Users/abu/dev/hackathon/nansen` | — | Research-only context for the Nansen Meridian buildathon. No code |

**These repos contain inherited code with unexamined decisions in it.** Masayume was
itself ported from upstream **Yosuku**, and some behaviour carries Yosuku's choices rather
than the owner's. Do not describe anything found in these repos as "the owner's rule" or
"your design" without checking provenance in the source comments. Surface questionable
inherited behaviour instead of porting it silently — §4.1 of the agent ledger is a worked
example (the ranking function drops realised P&L).

`stocklana/context/05-masayume-baseline-parity-inventory.md` is an existing rigorous
parity ledger — read it before redoing that analysis. Its key finding: **Masayume never
built the market engine; DreamDEX supplied it.** Tempo has no equivalent.

**Agari has since built one.** On `integration/w1` it has nine Anchor programs —
`agari-events` (a DreamDEX-style Event Contracts order book: markets, orders, fills,
candles), `agari-maker`, `agari-vault`, `agari-strategy`, `agari-parlay`, `agari-range`,
`agari-leverage`, `agari-private`, `agari-arena` — running on devnet, with an
implementation-grade DreamDEX spec (`stocklana/context/06`), an engine review with 26
corrections (`context/08`), and a decision log of hard-won fixes (e.g. D-114: exits never
depend on the owner; positions healthy and sellable at birth). **That is the engine
reference for Tempo.** Because Tempo is EVM and Masayume's ten contracts are already
Solidity, the Tempo port is: Masayume's contracts retargeted, plus a Solidity engine
written from Agari's spec.

Reusable research in `stocklana/context/`: equity price oracles and market hours (02),
prediction-market landscape (03), affordable equity price sources (13), DreamDEX engine
spec (06).

## Rules for editing this repo

**Never hand-type a resource URL into `context/tracks/_links/`.** Those files are
generated by `data/gen-links.py` from `data/colosseum-resources.json`:

```bash
./data/refresh.sh    # re-fetch corpus + regenerate, then review the diff
```

Colosseum updates the corpus mid-hackathon (Raydium is listed `comingSoon`; non-Solana
tracks have no sponsors *yet*). Refresh every few days.

**Don't recommend a tool for a track whose corpus doesn't list it.** Only Solana has
sponsors and RPC providers. Solana's Phantom/Helius/Meteora entries imply nothing about
Tempo, Hyperliquid, Zcash or Robinhood. Say so plainly rather than substituting.

**Preserve caveats.** The corpus descriptions carry deliberate warnings — testnet-only,
rate-limited, unofficial, no licence declared, non-production, untested. They are the most
valuable part of the data. Carry them forward; don't summarise them away.

**Quote offers exactly.** No sponsor entry currently contains a structured discount or
credit offer. Don't invent one.

## Searching Tempo facts

**227 doc pages are already on disk.** Search locally before hitting the network:

```bash
grep -ril "<term>" reference/tempo-docs-md/ | head
```

Index: `context/tempo/04-docs-corpus-index.md`. Any page can be re-fetched by appending
`.md` to its URL. Docs MCP: `https://mcp.tempo.xyz`. The `tempo-docs` skill covers
Tempo questions.

**Authority order for Tempo facts:** `github.com/tempoxyz` source (especially
`mpp-specs`, `tempo-std`, `tempo`) > protocol spec pages > guide pages > marketing pages.

## The two facts that drive every product decision

**1. This is a startup competition, not a code competition.** The FAQ rubric —
Founder-Market Fit, Insight, Product+Execution, Market Size, Founder Communication,
Viability, Traction — is what decides. Colosseum states explicitly that they are *not*
grading language, framework, design patterns or code quality. Two videos (2–3 min pitch,
≤3 min demo) are reviewed **before** the repo.

**2. One person, one team, one submission.** No hedging. Judged only on work done
**Sep 14 – Oct 12, 2026**; pre-existing code must be disclosed.

## Agent-layer findings that constrain architecture

- **TIP-1011 Access Keys replace most of EventVault.** Periodic spending limits that reset
  on intervals, call scoping (target + selector), recipient-bound transfers — all native.
  The TIP names its own motivation as replacing "a proxy contract that enforces
  destination/function restrictions," which is exactly what EventVault is. Only the
  market-semantic caps (per-trade stake, open positions, price ceiling) still need a contract.
- **ERC-8004 registries are predeployed**, so agent identity and reputation are on-chain
  and portable instead of a bespoke `StrategyRegistry` plus off-chain ranking.
- **MPP turns decision provenance into receipts.** Masayume records the model used in its
  own database; on Tempo a paid inference or data call is an on-chain TIP-20 transfer.

Design invariants worth preserving from Masayume: strategies are **data, never code**;
persona is **untrusted prompt input, never an enforcement rule**; the spec hash **never
pins a vendor**.

Design decision *not* to inherit unexamined: the ranking function
(`ranking.ts:23`, attributed to upstream Yosuku) orders agents by entrusted capital and
copy-trades and **drops realised P&L entirely** — `netBase` is computed, never sorted on.
See agent ledger §4.1.
