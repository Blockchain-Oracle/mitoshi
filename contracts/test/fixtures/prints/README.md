# Print fixtures (S2.7)

Real archived oracle data the verifiers are tested against. Copied unchanged from Agari
`03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/tests/vectors/prints/` except the Data Streams report.

| File | Source | Used by |
|---|---|---|
| `redstone-tsla-1789396800.{hex,json}` | The 5 TSLA gateway packages at 2026-09-14T14:40:00Z (`redstone-primary-prod`), built into the 724 B wire payload by Agari's `redstonePayload`; the same bytes printed on Solana devnet. Median `35,818,500,933` (e-8) | `test/engine/verifiers/RedStoneVerifier.t.sol` |
| `redstone-tsla-1789392600.{hex,json}` | The 5 TSLA packages at Mon 2026-09-14 09:30:00 ET (the Gap's closing boundary) | same |
| `datastreams-spy-v11-1788976800.hex` | The 1,152 B Chainlink Data Streams v11 SPY RegularHours payload (`fullReport`), taken from the `post(bytes)` input of Robinhood Chain tx `0x9bf9d7e68af55084a3a1738d3cae1d35a8eab85fbd09f80d6485525181ebf7f1` (block 68,272,301). Verified by `eth_call` on the Tempo mainnet VerifierProxy `0xcE73c8ad08CBDEaCa6078BF0627C8fe0a9a536E7` (2026-09-29): feedId `0x000bc7e4…05ac`, validFrom = observations = 1,788,976,800, mid 763.025e18, bid 762.99e18, ask 763.0632e18, marketStatus 2 | `test/fork/Mainnet.DataStreams.fork.t.sol`, `test/engine/verifiers/DataStreamsVerifier.t.sol` (decoded through the proxy stub) |

The RedStone production signers (the EVM `redstone-primary-prod` set, = Agari D-002): `0xdeb22f54…8499`,
`0xdd682dae…b5be`, `0x51ce04be…d202`, `0x9c5ae89c…b6de`, `0x8bb8f32d…b774`; threshold 3.

## Live "latest" payloads (X12, 2026-09-29)

`redstone-eth-latest-1790656520.{hex,json}` and `redstone-tsla-24_7-latest-1790656530.{hex,json}` were fetched from
`oracle-gateway-2.a.redstone.finance/data-packages/latest/redstone-primary-prod` on 2026-09-29 04:35Z by
`pnpm --dir scripts exec tsx drive/redstone-fixture.ts <FEED> latest <outBase>` (the builder ported from Agari's
`redstonePayload`). They prove `verifySpot` ("latest" mode, reused by `StockReference`, S15b) against the production
signers: ETH median 2,663.89405200, TSLA---24_7 median 356.83185257, 5 signers each.
