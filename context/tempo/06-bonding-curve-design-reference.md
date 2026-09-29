# Bonding curve design reference — Meteora DBC → Tempo

> **Correction (2026-09-21): Uniswap v4 is live on Tempo mainnet** (PoolManager
> `0x33620f62c5b9b2086dd6b62f4a297a9f30347029`, per Uniswap's v4 deployments page). Non-USD tokens *can*
> trade on Tempo. Memecoins can graduate into a **Uniswap v4 pool** — the Tempo equivalent of DBC's
> DAMM v2 — so there is **no destination AMM to build on mainnet**. v4 hooks also allow custom pricing,
> so the bonding curve itself could be a hook. Uniswap v4 is **not** on Tempo testnet; deploy the
> open-source contracts there ourselves. Sections below that say "two contracts" are superseded.

Source: `docs.meteora.ag/core-products/dbc/*`, captured 2026-09-17.

## Read this first: what is and isn't reusable

**Meteora DBC is Solana-only.** Mainnet program `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`,
written in Anchor/Rust against SPL and Token-2022. **None of it runs on Tempo.** The
`npx skills add MeteoraAg/meteora-invent` skill and the TypeScript SDK are Solana clients.

What *is* reusable is the **mechanism design**. DBC is a production launchpad that has
solved the lifecycle problems a memecoin launchpad hits, and its docs state the rules
explicitly. Treat this as a **specification to reimplement in Solidity**, not a library.

## The core idea worth stealing

> "Instead of asking a creator or launchpad to seed a traditional AMM pool on day one,
> DBC starts with a **virtual pool**."

No day-one liquidity. Traders buy and sell against a curve; every buy adds quote tokens
and moves the token along it. When the quote reserve reaches a configured threshold, the
launch **graduates** into a real AMM pool seeded by the accumulated quote plus a
configured base amount — **at the price the curve discovered**, not a price someone picked.

That removes the two hardest problems in launching a token: who provides initial
liquidity, and at what price.

## Lifecycle

```
Create config → Create virtual pool → Trade on curve → Curve complete → Migrate → Cleanup
```

On-chain state machine: `PreBondingCurve` → `PostBondingCurve` → `LockedVesting` → `CreatedPool`

| Stage | What happens |
|---|---|
| Create config | Partner/launchpad defines quote mint, curve, fees, token type, migration target, liquidity distribution |
| Create virtual pool | Creator launches the base mint + virtual pool **from that config** |
| Trade on curve | Buy/sell against the virtual pool until quote reserve hits the migration threshold |
| Curve complete | Normal swaps **stop**. Surplus and migration-fee claims become available |
| Migrate | Accumulated quote + configured base amount seed the destination pool |
| Cleanup | Leftover, LP/position claims, locks, one-time claim flags settle |

**The two-tier config/launch split is the product.** A launchpad publishes a reusable
template; creators launch from it. That is what makes it a *launchpad* rather than a
single launch, and it is cheap to copy.

## Rules DBC enforces (learn from these — they are scar tissue)

- **Curve shape:** 1 to **16 segments**, to control how price moves as demand grows.
- **Liquidity distribution must sum to 100%** across six buckets: partner and creator ×
  (unlocked | permanently locked | vesting).
- **At least 10% of liquidity must remain locked at day 1** after migration.
- **Vesting lock durations capped at 2 years.**
- **Fixed 0.2% protocol liquidity migration fee**, separate from the configurable
  partner/creator migration fee. It reduces what enters the migrated pool.
- **Leftover:** for fixed-supply launches, unused base tokens after migration accounting
  go to a configured leftover receiver, claimable only once the pool reaches `CreatedPool`.
- **Fee modes:** fixed fees, time schedulers, optional dynamic fees — used to shape early
  trading (anti-sniping). **Rate-limiter mode is deprecated for new configs.**
- **Migration keepers:** Meteora runs keepers on mainnet to graduate eligible pools
  automatically. Migration is *not* self-executing — someone must trigger it.

The locked-liquidity floor, the vesting cap and the leftover receiver all exist because
launchpads get rugged in specific ways. Copy the constraints, not just the curve.

## Mapping to Tempo — and the scope problem

| DBC concept | On Tempo |
|---|---|
| Base mint (SPL / Token-2022) | **TIP-20 via the predeployed Factory** — non-USD currency (its own symbol). Gets memos, `logoURI`, RBAC, TIP-403 policies, deterministic address |
| Quote mint (SOL / USDC) | **pathUSD** (`0x20c0…`) or another USD TIP-20 |
| Virtual pool + curve | **Build.** Solidity contract |
| **Destination AMM (DAMM v2)** | **Uniswap v4 on Tempo mainnet** (live); self-deploy v4 on testnet — *corrected 2026-09-21* |
| Position NFTs / LP tokens | Build, or use plain LP accounting |
| Migration keepers | Build an operator, or make migration permissionless-callable |
| Token-2022 transfer hooks | No equivalent; TIP-403 transfer policies are the nearest analogue |

### The scope problem

**DBC assumes a destination AMM already exists.** It graduates into Meteora's DAMM v2 —
a mature pool product Meteora already operates. Tempo has no general AMM to graduate into:
the enshrined Stablecoin DEX reverts **`ONLY_USD_PAIRS`** on non-USD tokens, and the Fee
AMM converts stablecoins for fee payment, not arbitrary assets.

So a DBC-style launchpad on Tempo is **two contracts, not one**:

1. the bonding-curve virtual pool, and
2. the constant-product pool it graduates into.

Plus a migration path between them, and an operator to trigger it.

That roughly doubles the memecoin path's contract surface versus the earlier estimate in
`02-idea-gap-analysis.md`, which assumed one AMM. **Deployments on Tempo cost 5–10×
Ethereum in gas** (≈ $0.015 per max-size contract in dollars and ~84% of a block's 30M general lane,
`16` §6 — corrected 2026-09-21), so a singleton pool contract with per-launch state is still the better
shape for block space rather than deploying a pool per token.

### The cheaper variant worth considering

Graduation does not have to target an AMM you build. A curve that **terminates into the
enshrined DEX** is impossible for a non-USD token — but a launchpad whose graduated
tokens are **USD-denominated TIP-20s** would graduate straight into the enshrined order
book with zero AMM to build, full native routing, and multi-hop liquidity via pathUSD.

That is the stablecoin launchpad. It is the same lifecycle machinery — config template,
threshold, graduation, locked liquidity, leftover — pointed at an asset class the chain
natively supports. **The stablecoin path gets DBC's entire design for roughly half the
contract work**, because Tempo already provides the destination venue.

If both launchpads ship, build the lifecycle engine once and let the *graduation target*
be the thing that differs: enshrined DEX for USD tokens, your own pool for non-USD.

## Open questions

1. Singleton pool with per-launch state, or a pool contract per launch? (Deployment cost.)
2. Is migration permissionless-callable, or does it need a trusted keeper?
3. Which DBC constraints carry over — the 10% locked floor, the 2-year vesting cap, a
   protocol migration fee? These are defensible product decisions, not just mechanics.
4. Does the memecoin path graduate at all, or just trade on the curve indefinitely?
   (Never graduating removes the destination-AMM problem entirely, at the cost of the
   product's most credible promise.)
