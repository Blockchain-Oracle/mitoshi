# Engine gas (S2.10)

Measured with Foundry 1.8.3 in Tempo mode under call isolation (every top-level call is its own transaction), by
`contracts/test/engine/Gas.t.sol` into `contracts/snapshots/engine.json` (CI: `forge test --gas-snapshot-check`).

- **gross** = the call's `gasTotalUsed`: what the transaction's gas limit must cover. Tempo charges 250,000 per new
  slot (TIP-1000) at execution time even when a storage credit will refund it.
- **net** = gross − the end-of-transaction TIP-1060 credit refund: what the receipt charges. X7 proves forge reproduces
  Moderato's receipts exactly (1,033,438 for 4 new slots; 53,450 with 4 credits — acceptance/S2.md).
- Call gas excludes the 21,000 intrinsic and calldata; the Moderato receipts of the live drive (S2.12, acceptance/S2.md)
  include them.
- Credits accrue to the **engine** (the contract that clears storage) and are spent first-come-first-served by the next
  new slot any caller creates (F-S2-03). Redeems (deleted positions), emptied levels, emptied bitmap words and a
  maker's cleared slot B mint them; `reserveNodes` pre-builds node slots so no rest ever creates one.

## A.1.7 rows

| Operation (A.1.7) | Plan estimate cold / credits | gross (limit) | net cold pool | net with credits / warm pool | Snapshot |
|---|---|---|---|---|---|
| First IOC buy by a new holder, 1 partial fill (taker slot A new; also the market's first trade → counters slot new) | ≈ 350k / ≈ 110k | 640,142 | 640,142 | **150,142** | `firstIocNewHolder.*` |
| Repeat IOC, same holder and market (1 partial fill) | ≈ 100k | 143,542 | 143,542 | 143,542 | `repeatIoc` |
| One partial fill / one full fill (warm taker) | ≈ 14–17k / 35–40k per fill | 143,532 / 166,160 | same | same | `fills.1partial`, `fills.1full` |
| 2 full + 1 partial fill | — | 236,090 | 236,090 | 236,090 | `fills.2full1partial` |
| 16 fills (the launch fill cap) | ≈ 650k | 847,951 | 847,951 | 847,951 | `fills.16` → ≈ 47k per additional full fill |
| Eviction (1 evicted + 1 fill vs 1 fill) | ≈ 35k | 191,979 vs 143,530 | — | — | `evict1fill1`, `evict0fill1` → ≈ 48k per eviction |
| Full redeem (position deleted) / with a 1-order drain (T05) | ≈ 75k | 88,105 / 128,998 | same | same | `redeem.*` |
| First PostOnly rest by a new maker in a new market (node, level, bitmap word, position A+B) | ≈ 1.5M / ≈ 150k | 1,877,621 cold; 1,133,746 warm pool | 1,877,621 | **153,746** (reserved node + 4 credited slots) | `firstPostOnlyRest.*` |
| `openWindow` (4 new slots: market s0, s4, s5, `marketIdOf`) | ≈ 1.8M | 1,072,083 | 1,072,083 | as credits allow | `openWindow` |
| `registerSeries` / `addPolicyVersion` (admin, once per Series) | — | 1,051,978 / 1,073,155 | same | — | |
| `reserveNodes(4)` (8 new slots) | — | 2,054,524 | — | — | ≈ 513k per node, paid once by the house |
| `mintSet` first (position A + the market's counters + engine balance) / `mergeSet` + withdraw | — | 825,040 / 80,774 | same | — | |
| Cancel 1 order + withdraw | — | 122,090 | — | — | |
| `recordPrint` with 5 RedStone signatures / `settle` | — | 115,340 / 44,734 | — | — | |
| Lens walk: 1 node / 32 nodes (`levels`) | — | 59,477 / 526,692 | — | — | ≈ 15,071 per node |

## Decisions this sets

- **Fill caps stay 16 / 16** (venue-spec `fillsCap`, `evictionsCap`; engine hard caps 32 / 16). Worst case for one
  placement at the caps: 16 full fills (≈ 848k) + 16 evictions (≈ 770k) + 64 skipped expired nodes (≈ 5k each, ≈ 320k)
  ≈ 1.95M gross, far inside the 30M transaction cap and the 30M general-lane block budget; a taker's gas limit must
  still cover gross new-slot charges (≤ 2 per placement for a new holder).
- **`maxNodes` for on-chain walks: 64** (≈ 1.0M gas; ≈ 15k per node visited). Products that price against rested depth
  (Leverage, Parlay, Range) pass it with `minRestSec = max(series.minRestSec, their own)`; off-chain callers may pass
  thousands.
- **The house pre-grows the pool** with `reserveNodes` at deploy (≈ 513k per node, once), so no user rest ever pays for
  a node, and funds the credit pool implicitly through normal redeems.
- The first trade of a market pays for its counters slot (volume, backing): 250k gross, 5k net with a credit.
- Slot A is written credit-before-debit so it never passes through zero within a call (F-S2-15): a 0 → non-zero
  write is a new slot on Tempo (250k gross, even when refunded).

## Moderato receipts (S2.12 live drive, tx-level: intrinsic + calldata included)

The drive ran on a fresh venue whose credit pool was still nearly empty, so these are close to the cold column.
Every hash is in `docs/plan/acceptance/S2.md`.

| Transaction | gasUsed |
|---|---|
| `openWindow` (first on the venue / next two) | 1,322,071 / 1,072,071 |
| First PostOnly rest by a new maker in a new market (reserved node; level, bitmap word, position A+B new) | 1,371,848 |
| Second PostOnly rest, other side (its level and bitmap word new) | 631,240 |
| `recordPrint` open, 5 RedStone signatures (the market's print slot new) / close | 614,461 / 113,105 |
| First IOC by a new holder, 1 fill (taker slot A + the market's first-trade counters new, no credits yet) | 628,842 |
| IOC by a second new holder, 1 fill | 381,709 |
| `mintSet` (existing position) | 67,840 |
| `settle` | 294,734 |
| `redeemFor` paid / held as credit (receive policy) | 82,030 / 64,408 |
| Own `redeem` draining 2 resting quotes (T05) | 140,760 |
| `withdrawCredit` | 63,349 |
| `approve` (first allowance slot) / TIP-403 `setReceivePolicy` | 528,290 / 280,213 |
