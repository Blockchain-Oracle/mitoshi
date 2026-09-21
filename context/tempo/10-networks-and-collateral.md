# Networks and collateral — testnet and mainnet

Captured 2026-09-21. **Owner decision:** deploy on both Tempo testnet (Moderato) and mainnet.

## Facts (verified)

- **Tempo has no native gas token — it is not ETH.** Fees are paid in USD stablecoins
  (`00-network-facts.md`). Fees can also be sponsored, so a user needs no gas token at all
  (production sponsorship needs an approved payer; the public sponsor is testnet-only).
- **Circle USDC is not on Tempo.** Tempo is on neither Circle's testnet faucet nor Circle's official
  USDC contract-address list (checked 2026-09-21, zero mentions in both). USDC on Tempo exists only as
  **USDC.e**, bridged through LayerZero/Stargate. Tempo's own docs route native USDC out via Ethereum
  and CCTP.
- **Testnet faucet** gives **pathUSD, AlphaUSD, BetaUSD, ThetaUSD — 1M each** (`0x20c0…0000` to `…0003`).
- **Mainnet funding:** Tempo Wallet fiat onramp, or bridges — LayerZero (Stargate), Chainlink CCIP,
  Squid, Relay, Across, Bungee.
- **pathUSD** (mainnet) is issued by Bridge, backed 1:1 by USD reserves, **minted by depositing USDC.e
  and redeemed to USDC through Bridge**; it is the neutral root quote token of Tempo's DEX and the
  fallback fee token.

## Recommendation

| | Testnet | Mainnet |
|---|---|---|
| **Settlement unit** | Faucet **pathUSD** (free, 1M) — or our own test dollar issued via the TIP-20 Factory with `currency = "USD"`, the Tempo version of the tUSDC used on Somnia | **pathUSD** |
| **What users can deposit** | Any faucet stablecoin | **Any USD TIP-20** (USDC.e, USDT0, pathUSD …) — swapped to pathUSD on the enshrined DEX (Tempo's relay handler supports automatic stablecoin swaps) |
| **Fees** | Sponsored by the app | Sponsored by the app |
| **Stock tokens** | Unbacked, labelled | Backed for real (`09-…`) |

Why pathUSD on mainnet: it is the chain's neutral dollar, every USD stablecoin routes to it on the
enshrined DEX, and users "bet with whatever dollars they have." Why not USDC.e alone: it's a bridged
wrapper, and forcing it means turning away people holding USDT0 or pathUSD.
