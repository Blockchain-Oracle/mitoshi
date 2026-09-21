# Agent subsystem — fidelity ledger (Masayume → Tempo)

Method: `reference-product-fidelity` §1–§3. Scope: the **agent / strategy / copy-trading
subsystem only**. Market engine, games and tickets are covered elsewhere.

## 1. Authority record

| Field | Content |
|---|---|
| **Reference** | Masayume `M:` = `/Users/abu/dev/hackathon/sommina-events` @ **`68f7a09`** (2026-09-10, `main`; 2 untracked files) |
| **Secondary** | Agari `/Users/abu/dev/hackathon/stocklana` @ `integration/w1` `2adcb12` (2026-09-21) — a working Solana port of the same baseline, incl. `agari-strategy` and `agari-vault` (repinned 2026-09-21; was `b4e41f5`, S1) |
| **Prior analysis** | `stocklana/context/05-masayume-baseline-parity-inventory.md` — existing rigorous ledger; not superseded, extended here for Tempo |
| **Target** | Tempo mainnet, chain ID `4217` |
| **Baseline strength** | **Minimum product baseline, built in full.** Every capability ships, in Masayume's language. Owner's standing rule (Agari D-113): the deadline is never a reason to cut, hide, defer or thin |
| **Allowed deviations** | Chain (Somnia → Tempo); asset class; brand; additive launchpad (stablecoin + memecoin) |
| **Authority order** | 1. Owner's latest direction · 2. Masayume `68f7a09` source · 3. `tempoxyz` source (`mpp-specs`, `tempo-std`, `tempo`) · 4. Tempo protocol specs · 5. Tempo guides |
| **Task boundary** | **Research and documentation only. No implementation.** (Owner directive.) |
| **Evidence** | **[C]** confirmed from source this pass · **[I]** inference |

## 2. Reconstruction inventory — what Masayume's agent layer actually is

**Contracts** `M:contracts/src/strategy/{IStrategyRegistry,StrategyRegistry}.sol`,
`M:contracts/src/vault/{IEventVault,EventVault}.sol`, `ArenaAgents.sol` **[C]**

**Packages** `M:packages/core/src/strategies/` (types, spec, model, ranking, record,
agent, agent-prompt, health) · `M:packages/markets/src/strategies/` (read, write,
agent-context, price-basis, deployment) · `M:packages/brain/src/` (agent-decide,
agent-read) · `M:packages/db/src/` (strategies, strategy-attempts, strategy-decisions)

**Services** `M:services/ops/src/actors/strategy-runner/` (lifecycle, decide, execute,
agent, agent-record, env, durability) · `x-relay/`

### The design principles worth preserving exactly

1. **Strategies are data, never code.** `specHash = keccak256(canonical spec)`; the
   runner evaluates data. Publishing a strategy never deploys code. **[C]**
2. **The persona is untrusted prompt input, never an enforcement rule.** The LLM shapes
   the call; a separate `posture` (`guarded|balanced|active`) is what the gate enforces. **[C]**
3. **The spec hash never pins a vendor.** "No model name lives here — the model actually
   used is recorded per decision." **[C]**
4. **The registry holds the envelope; the vault does the enforcing.** `Strategy.envelope`
   is the widest caps a subscriber's grant may carry; `CapsOutsideEnvelope` rejects the rest. **[C]**
5. **Ranking is on entrusted capital and executed copy-trades, never win rate.** Source:
   `M:packages/core/src/strategies/ranking.ts:23`, which attributes it to "**the
   reference's own rule**" — i.e. inherited from upstream **Yosuku**, not authored for
   Masayume. Anti-gaming intent: win rate can be farmed with one tiny winning trade.
   **⚠️ Known defect — see §4.1. Do not port unexamined.** **[C]**
6. **One live grant per kind per owner**; daily spend resets per UTC day; "proceeds never
   return" to the grant budget. **[C]**

### Data shapes

`Strategy{creator, runner, specHash, metadata, envelope, subscriptionFee, active,
createdAtSec, subscribers, revision}` · `Subscription{grantId, subscribedAtSec, active}` ·
`VaultCaps{maxStakePerTradeBase, maxDailySpendBase, maxOpenPositions, maxPriceRaw}` ·
`VaultGrant{grantId, owner, actor, kind∈{session,executor,strategy}, revoked,
expiresAtSec, spentDay, spentTodayBase, openPositions, caps, budgetBase}` ·
`AgentSpec{persona 1–600, posture, cadences[]}` · `OracleFollowSpec{preset, lookback 2–12,
thresholdBps}` · `AgentRow{runner, strategies, subscribers, copyTrades,
capitalEntrustedBase, netBase, settled, maxStakePerTradeBase, lastActiveSec}` **[C]**

## 3. Parity ledger

| # | Capability | Class | Tempo mapping | Evidence |
|---|---|---|---|---|
| A-1 | Publish a copyable strategy | **Adapted** | Strategy record keyed to an **ERC-8004 agent identity** (`0x8004A169…`, predeployed) rather than a bespoke registry | **[C]** predeploy table |
| A-2 | Strategy = data, `specHash` | **Exact** | Unchanged. keccak of canonical spec | **[C]** |
| A-3 | Runner key = the one actor that trades | **Adapted** | Tempo **Access Key** delegated from the owner account | **[C]** `tempo-transaction` |
| A-4 | `expiresAtSec` | **Exact→native** | Access-key expiry, native | **[C]** TIP-1011 |
| A-5 | `maxDailySpendBase` + UTC-day reset | **Exact→native** | **TIP-1011 periodic spending limits that reset on fixed intervals** | **[C]** TIP-1011 §Motivation |
| A-6 | `budgetBase` (spend ceiling) | **Exact→native** | TIP-1011 `TokenLimit{token, amount}` | **[C]** |
| A-7 | Grant kind restricts what the actor may do | **Exact→native** | **TIP-1011 call scoping** — target address + selector set | **[C]** |
| A-8 | Runner may only pay the venue, not arbitrary addresses | **Additive→native** | **TIP-1011 recipient-bound token calls** (first ABI address must match) — Masayume had no equivalent | **[C]** |
| A-9 | `maxStakePerTradeBase` | **Adapted** | Per-call size is market semantics; enforce in the market/vault contract | **[I]** |
| A-10 | `maxOpenPositions` | **Adapted** | Stateful position count; contract-enforced | **[I]** |
| A-11 | `maxPriceRaw` (price ceiling) | **Adapted** | Price-dependent; contract-enforced | **[I]** |
| A-12 | `CapsOutsideEnvelope` check | **Exact** | Same invariant, checked against the access key's limits | **[C]** |
| A-13 | Subscribe / unsubscribe + flat creator fee | **Adapted** | Same flow; fee paid in **TIP-20** (pathUSD or own token) | **[C]** |
| A-14 | Revoke consent | **Exact→native** | Access-key revocation | **[C]** |
| A-15 | Agent ranking (`rankAgents`) | **Adapted + upgraded** | Keep the capital/copy-trade rule; **publish to the ERC-8004 Reputation Registry** (`0x8004BAa1…`) so the record is on-chain and portable | **[C]** predeploy table |
| A-16 | LLM decision (`brain/agent-decide`) | **Adapted + upgraded** | Model called and **paid via MPP** (OpenAI/Anthropic/Gemini/Mistral). The model used stops being self-reported and becomes an **on-chain payment receipt** | **[C]** MPP use-cases |
| A-17 | Market/price data for decisions | **Adapted + upgraded** | **MPP-paid** Alpha Vantage / CoinGecko / Nansen / Dune — each read is a receipt | **[C]** |
| A-18 | Runner health (`alive/stale/never-started` + "why") | **Exact** | Unchanged; service concern | **[C]** |
| A-19 | Strategy fills / decisions journal (Postgres) | **Adapted** | Keep DB; **Tempo Indexer API** (read-only SQL, `tidx`) replaces custom chain indexing | **[C]** |
| A-20 | Gasless copy-trading via `ERC2771Forwarder` | **Adapted→native** | **Fee sponsorship + no native gas token.** Forwarder unnecessary | **[C]** |
| A-21 | Collateral (tUSDC faucet) | **Adapted** | pathUSD (`0x20c0…`) or an own-issued TIP-20 | **[C]** |
| A-22 | Trade-from-X (`x-relay`) | **Adapted** | Built in full. Same design; executes through the runner's TIP-1011 access key instead of an EventVault grant | **[C]** `M:services/ops/src/actors/x-relay/` |
| A-23 | `ArenaAgents` (game-side agents) | **Adapted** | Built in full, with the games (Agari's `agari-arena` is a working reference) | **[C]** `M:contracts/src/games/ArenaAgents.sol` |
| A-24 | Agent spend receipts as a ranking input | **Additive** | New: rank/QA agents by **what they bought before acting**. No Masayume equivalent — only possible because MPP settles on-chain | **[C]** derived |
| A-25 | Agent-to-agent subcontracting | **Additive** | Auto.exchange / AgentMail via MPP | **[C]** |
| A-26 | Per-agent accounting address | **Additive** | Tempo **virtual addresses** + Address Registry (`0xFDC0…`) | **[C]** |
| A-27 | Passkey-bound agent keys | **Additive** | On-chain **WebAuthn/P256** verification (`0x5165300…`, TIP-1020); docs show device-bound non-extractable WebCrypto keys as access keys | **[C]** |

**Blocked:** none in this subsystem. Every reference capability maps.

## 4.1 Defect inherited from upstream: the ranking ignores P&L

`rankAgents` sorts on `capitalEntrustedBase` → `copyTrades` → `subscribers`
(`ranking.ts:58-60`). **`netBase` — realised profit and loss — is accumulated into every
`AgentRow` at line 51 and then never read by the sort.** **[C]**

Consequence: an agent that deploys large subscriber capital and *loses* outranks a
smaller, profitable one. The leaderboard measures activity, not skill.

Acceptable on a testnet demo; wrong for a product where users pick who to trust with
money. Treat as an **open design decision**, not inherited behaviour. The anti-gaming
intent is sound — the fix is to keep a capital/activity floor as an eligibility gate and
then rank by a risk-adjusted return, rather than dropping P&L from the ordering entirely.

Affects row A-15, and A-24 (spend receipts) is only a meaningful ranking input if the
ranking reflects outcomes at all.

## 5. What this changes

**Tempo absorbs roughly half of EventVault.** A-4 through A-8 are protocol features on
Tempo and hand-built Solidity on Somnia. TIP-1011 names the workaround it replaces:
"deploy a proxy contract that enforces destination/function restrictions." That proxy is
EventVault. Only the **market-semantic** caps (A-9, A-10, A-11) still need a contract.

**The agent layer gets strictly better, not just ported.** Identity and reputation move
on-chain and become portable (A-1, A-15). Decision provenance moves from self-reported to
receipted (A-16, A-17). Recipient-binding (A-8) is a safety property Masayume could not
express.

**The thesis follows from the ledger, not from marketing.** The inherited ranking rule
(capital deployed, not win rate) has the right instinct and the wrong implementation
(§4.1). On Tempo you can do something no other chain supports: **rank by what the agent
bought before it acted.** A-24 is the only row with no reference implementation anywhere
— which is precisely what the **Insight** criterion rewards.

## 6. Open questions for the owner

0. **Ranking (§4.1)** — keep the inherited activity-only ordering, or gate on capital and
   rank on risk-adjusted P&L? This is a product decision, not a port decision.
1. **A-9/A-10/A-11 enforcement site** — inside the market contract, or a thin
   Masayume-style vault kept for exactly these three caps?
2. **A-15 reputation writes** — publish every settlement, or checkpoint periodically?
   (Cost vs. freshness; deployments and writes are dearer on Tempo.)
3. **A-16 cost model** — MPP-paid inference per decision is a real per-trade cost. Who
   pays: the runner, the subscriber, or the protocol fee?
4. **A-24 privacy** — on-chain research receipts make an agent's data sourcing public.
   That is the feature *and* a leak of its edge. Tempo **Zones** (confidential balances)
   could gate it, but Zones are **testnet-only**.
