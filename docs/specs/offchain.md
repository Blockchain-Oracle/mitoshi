<!-- Copied from the approved build plan (v5, 2026-09-29). Change it only through D-entries in docs/plan/decisions.md. -->

## Appendix C — Web, ops, data, infrastructure (spec; S0 copies to `docs/specs/offchain.md`)

**Findings that change this layer:** viem ≥ 2.56's Tempo `verifyHash` already verifies P-256/WebAuthn/keychain
envelopes → one server verifier · the accounts SDK provides sessions (`Handler.webAuthn` cookie + `getSession`;
`Handler.auth` SIWE) · `Handler.relay`'s `validate` runs twice (fill + raw send) → debit budgets only on raw methods ·
Masayume's sponsor gates are in-process counters (break on serverless) → Agari's Postgres ledger · **injected secp256k1
wallets can't sign 0x76 Tempo txs** (no calls[], no fee payer, no inline key authorization) → reduced capability set ·
deposits-never-sponsored becomes relay policy (D-entry + disclosure) · Agari's RedStone archive runs on the owner's
laptop → takeover in S0 · relay policies in `packages/markets` (ops co-signs) · one venue (no `venueId`) ·
`anthropic.mpp.tempo.xyz` exists (docs push session intent → probe first).

### C.1 Monorepo

**C.1.1 Layout:** `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `.nvmrc` (24),
README (disclosure), `THIRD_PARTY_NOTICES.md`; `.github/workflows/{ci,contracts,nightly-fork,deploy-ops}.yml`;
`context/ reference/ data/` (research, never imported); `docs/plan/*`, `docs/specs/*`; `contracts/` (`src/{engine,
products/*,fair,stocks,themes,launch,robinhood,transit,common,lz}`, `test/`, `script/`, `deployments/<chainId>/<area>.json`);
`packages/{core,markets,brain,db,clients}` as `@cwf/*`; `services/ops` (`@cwf/ops`, Dockerfile, `fly.{testnet,mainnet}.toml`);
`web`; `scripts/{codegen,invariants,keys,deploy,drive,archive,e2e}`; `infra/{secrets.md, env/*.example, vercel.md,
fly.md}`. Brand lives only in `web/src/lib/copy.ts` (Q-019).

**C.1.2 Invariant rules** (`scripts/invariants/rules.mjs`): `chain-io-boundary` (only `packages/markets` imports
`viem/tempo` actions, `accounts/server`, `mppx`, `tidx.ts`; wallet providers may import `wagmi/*`), `write-boundary`
(sends only in `packages/markets/src/tx/send.ts` + `stocks/bridge-in.ts`), `banned-wagmi-hooks`, `no-calldata-suffix`,
`fee-token-explicit`, `no-native-value` (Robinhood lockbox send allowlisted), `no-destination-abi` (allowlist bridge
`send`, `creditFor`), `address-drift` (`pinned.ts` vs `viem/tempo` Addresses and doc tables), `generated-abi`,
`relay-policy-coverage` (every deployed area has a policy; vault `never` list present), `dev-routes-gated`,
`no-agent-files`, plus Masayume's `file-length ≤ 400`, `time-suffix`, `no-float-money`, `design-literals`,
`order-lane-ioc`, `status-gate-enum`, `expiry-from-headroom`. Dependency direction: core ← clients ← markets ← {brain
(fetch only), db} ← ops, web.

**C.1.3 Catalog:** next 16.3.4, react/react-dom 19.2.8, typescript ^5.9, zod ^4.1, viem ^2.56.0, wagmi ^3.7.7,
@wagmi/core ^3.6.5, accounts ~0.18.4 (exact pin), ox ^0.14.20, mppx ^0.10.1, tidx.ts ^0.1.2, @tanstack/react-query ^5.90,
lightweight-charts ^5.2, vitest ^4, tsx ^4.20, tailwindcss ^4.1, postgres ^3.4.9, ai ^7, @ai-sdk/{anthropic,openai,google}
^4, @upstash/redis ^1, idb-keyval ^6.3, rettiwt-api 7.1.3, sharp 0.34.5, opentype.js 1.3.4, ws 8.21.3, @playwright/test,
motion (`motion/react`), @base-ui/react, lucide-react, @number-flow/react, @axe-core/playwright, @lhci/cli,
babel-plugin-react-compiler (the experimental `turbopackRustReactCompiler` stays off). Not used: recharts, visx, gsap, headlessui, qrcode.react, swr, Radix (one primitive base).
Removed: RainbowKit, `@somnia-chain/markets-sdk`, wagmi 2. v4 calldata hand-encoded with viem (`packages/markets/src/v4/
encode.ts`) against golden vectors from mainnet receipts. Node 24, pnpm 11.24.0 (settings in `pnpm-workspace.yaml`; `allowBuilds` for
native/sharp/esbuild builds; `minimumReleaseAge` default 1 day; `catalogMode: strict`).

**C.1.4 Scripts:** `dev`, `build`, `typecheck`, `test`, `invariants`, `codegen`, `codegen:check`, `contracts:build`
(both profiles `--sizes`), `contracts:test`, `db:migrate`, `ops:start`, `deploy:<area>` (forge script → fragment →
codegen), `drive:<area>`, `e2e:passkey`, `e2e:browser`, `ci`.

**C.1.5 Foundry:** default profile Tempo (`network = "tempo"`, solc 0.8.30, via_ir, `out/tempo`, `test/tempo`, skip
robinhood/transit); `evm` (no network, explicit `evm_version` until X1 confirms Robinhood Chain's target, `out/evm`,
`test/evm`, skip the Tempo areas); `ci` (fuzz 10k, `--gas-snapshot-check`); `invariant` (256 runs × depth 500);
rpc endpoints tempo, moderato, robinhood, robinhood_testnet, base_sepolia; verification against Tempo's Sourcify-
compatible verifier `--verifier-url https://contracts.tempo.xyz` (no `[etherscan]`); ERC-7201 structs carry
`@custom:storage-location`.

**C.1.6 Fragments → codegen:** `contracts/deployments/<chainId>/<area>.json` schema v1 `{chainId, area, commit,
deployedAtUtc, deployer, contracts: {Name: {address, artifact, profile, deployBlock, txHash, proxy, history[]}}, roles,
params, external}` (`history[]` keeps retired Moderato addresses indexable). `scripts/codegen/clients.mjs` →
`packages/clients/src/{abis/<Contract>.ts, deployments.ts, events.ts, relay-targets.ts, manifest.json}`; hand-written
`pinned.ts` (pathUSD, precompiles, Permit2, Multicall3, CreateX, Arachnid, ERC-8004 per network, v4 mainnet + pinned UR,
LayerZero endpoints/EIDs/DVNs/executors/LZD, Robinhood testnet tokens + faucet, VerifierProxy per network, RedStone
signers).

### C.2 `packages/markets` on Tempo

**C.2.1 Core type changes:** `EventMarket` drops `poolAddress, marketAddress, yes/noTokenId, oracleQuestionId, venueId,
finalized, strikeRaw/isUpDown`, adds `seriesId, index, lane ('regular'|'gap'|'crypto24'|'stock24'), lockAtSec,
policyVersion, printSource, voidReason, singleSource, status`; `MarketStatus` = Listed/Trading/Locked/AwaitingClose/
Resolved/Voided via pure `statusOf(market, nowSec)`; `OnchainSnapshot` = state, prints, payouts, lockAt, lastPriceTicks,
seq; `BookTarget/QuoteTarget` = `{marketId, decimals}`; `BalanceSheet` = `engineCreditByMarket`, `vaultBase`;
`TxIntent.redeem {marketId}` + `redeem-partial`; `VaultIntent.vault-sweep {marketId}`; `IntentRecord {chainId,
validBeforeSec, nonceKind, sponsored}`; port signatures drop `venueId`/`pool`; add `freshExitQuote`. Somnia modules
replaced: `constants/{chain,gas,faucet}` → `constants/{network,faucet}`; `faucet/` → Moderato policy; copy strings lose
STT/gas; `urls/` → Tempo/Robinhood/Base/LayerZero explorers, RedStone/Data Streams. New pure modules `stocks/`,
`bridge/`, `themes/`, `launch/`, `auth/signed-message.ts`.

**C.2.2 MarketsProvider** (EngineLens = batch views; index = our `/api/index`): `listLiveLanes` (index), `getMarket`
(index, lens fallback), `listSettled`, `getOnchain` (lens, the only write gate), `getBookDepth` (lens `levels` ×2 → Up/
Down), `getBookParams` (series grid; persisted-read allowlist), `freshQuoteStake` (fresh levels → Agari
`core/market/book-math.ts` walk → protective limit 300 bps / 10 ticks), `freshExitQuote` (D-067), `getOpeningPrice`,
`getAssetPrice` (ops `/prices/latest` + SSE), `getPriceHistory`, `settlementFeeBps` (0 by Q-005), `listOpenPositions`,
`getHoldings`, `listClaimables` (+ vault credit rows), `listWalletHistory`, `getBalanceSheet` (pathUSD + engine credit +
locked + `EventVault.accountOf`), `syncClock`/`nowMs`, `nextWindow`, `getResolution`, `getVaultSnapshot`,
`getVaultHoldings` (`EventVault.holdingsOf`).

**C.2.3 Submitter** (every send via `tx/send.ts`: calls[], `feeToken` pathUSD, `feePayer` when the area policy covers
it, expiring nonce for keys/actors, protocol nonce for owner sends, explicit priority fee; journal: receipt → confirmed,
none after `validBeforeSec` → not included, never re-send):

| Intent | Calls | Signer | Sponsored |
|---|---|---|---|
| wallet order | `[pathUSD.approve(engine, maxCost), engine.placeOrder(IOC …)]` | owner | yes |
| vault order / vault-grant order | `EventVault.place` / `placeFor(grantId, …)` | owner / session P-256 account | no (Q-021) / yes |
| pre-open call, cash-out, cancel | PostOnly on Listed; SELL IOC; `cancelOrders/cancelAll` | owner/key | yes |
| redeem / claim-all | `[engine.redeem(id₁) …, engine.withdrawCredit(…)]` | owner | yes |
| vault deposit / depositAndGrant / grant / fundGrant | approve + call | owner | **never** |
| vault withdraw / withdrawPrivate / revoke / crankSettle / sweep | single call | owner/any | yes |
| product intents (parlay, range, maker, leverage, private, arena, strategy) | exact approve + call | owner/key | per area policy |
| stock buy/sell | `[pathUSD.approve(Permit2), Permit2.approve(pathUSD, UR), UR.execute(V4_SWAP)]` | owner | yes |
| bridge-out | `[mirror.approve(adapter), pathUSD.approve(adapter, fee), adapter.send(…)]` | owner | yes (Tempo fee) |
| bridge-in (Robinhood Chain) | `approve(lockbox)` then `lockbox.send{value}` (EIP-5792 if supported) | injected on RH | n/a (ETH) |
| theme follow / unfollow | `key_authorization` + `ThemeRouter.follow` / `[revokeKey, unfollow]` | owner | yes |
| launch stablecoin / curve buy-sell-create / graduate | 9-call batch / CurveLaunchpad | creator / owner / keeper | yes |
| agent register / feedback | ERC-8004 | owner / rater | yes |

**C.2.4 Module rewrite list** (`packages/markets/src/`): `chains.ts` (tempo/tempoModerato from `viem/tempo/chains`,
robinhood/robinhoodTestnet/baseSepolia), `env.ts`, `deployments.ts`, `errors/*` (+ `SpendingLimitExceeded`,
`CallNotAllowed`, `KeyAlreadyRevoked`, fee-token, sponsorship rejected, held by receive policy), `runtime/{read-runtime,
coordinator,health,lens,multicall}.ts` (one engine-event WS subscription per market), `engine/{calls,decode,status}.ts`
(replaces the SDK trader), `provider/*`, `tx/{send,batch,fee}.ts`, `sessions/*` (connector client, WebCrypto P-256
local account, secp256k1 local for ops, access-key account for themes), `sessions/session-key.ts`
(`WebCryptoP256.createKeyPair()` non-extractable → `Account.fromWebCryptoP256`; gas top-up deleted), `submitter/*`,
`relay/{client,types,engine,gates,ledger,status}.ts` + `relay/policies/<area>.ts`, `auth/verify.ts`, `faucet/*`
(`tempo_fundAddress`), `vault/*` (sponsor.ts deleted), `games/*` (STT sponsor deleted), product folders, `private/keys.ts`
(browser 32-byte secret committed as `keccak(secret)` in the signed text; P-256 signatures are randomized), `prices/
{redstone,datastreams,spot}.ts`, `proof/*` (`eth_call` re-verify), `holdings/*` (TIP-20 × `ScaledUIView`), `stocks/`,
`v4/`, `themes/`, `launch/`, `agents/`, `indexer-api/`, `mpp/`, `ops/*`, `react/*` (+ `useStock*`, `useBridge*`,
`useTheme*`, `useLaunch*`, `useRelayStatus`).

**C.2.5 Reads/events this layer needs from S2** (feed S2.1): lens `marketOf`, `marketsOf(ids[])`, `levels`,
`topOfBook(ids[])`, `positionOf`, `positionsOf(holder, ids[])`, `creditOf`, `seriesOf`, `openOrdersOf`; events with
indexed `marketId` + per-market `seq` (names per App. A); `EventVault.holdingsOf(owner, marketId)`; `subscribe` resolves
the owner's live STRATEGY grant.

### C.3 Web

**C.3.1 Wallet layer:** `web/src/providers/wallet/wagmi-config.ts` — `createConfig`, `ssr`, cookie storage, EIP-6963;
testnet chains `[tempoModerato, robinhoodTestnet, baseSepolia]`, mainnet `[tempo, robinhood]`; Tempo transport
`withRelay(http(rpc), http('/api/relay'))`; connectors `webAuthn({ testnet, authUrl: '/api/auth', feePayer:
'/api/relay' })`, `tempoWallet()`, `injected()`, WalletConnect (required: phones have no injected wallet for
bridge-in), `shellDevice()` in the app (SM3). Agari replica file by file: `kit-wallet.ts` →
deleted; `WalletShellProvider` (keep hydration/restoring; wagmi connections; publish `tempo` + `robinhood` sessions;
mount picker, account modal, Robinhood modal); `wallet-shell-context` (`{status, connecting, tempo{address, chainId,
kind, caps}, robinhood{address, chainId}, network}`); `useWalletChoices` (Passkey create/sign in, Tempo Wallet,
installed, browser install links); `WalletPicker`/`WalletPickerPhone` (passkey row with name → `capabilities: {method:
'register', name}`); `wallet-steps` (+ passkey step, Robinhood wallet explainer); `AccountModal` (+ kind badge, network,
Trading Balance, linked Robinhood wallet); parts/css/avatar/copy rewritten; `HeaderAccount*` pill reads pathUSD. Two-
wallet model; `useWalletSession()` the only wagmi surface (`caps` per kind; injected = no batch/sponsor/key auth);
`UserSessionProvider` builds a Tempo `SubmitterSession` + a separate `RobinhoodSession`; switches dispose sessions;
injected accounts do a one-time `FeeManager.setUserToken(pathUSD)`.

**C.3.2 Auth + KV:** `/api/auth/[...path]` = `Handler.webAuthn({ kv, origin: APP_ORIGIN, rpId: PASSKEY_RP_ID, path:
'/api/auth' })`; `server/kv.ts` over Upstash (`get`, `set` EX, `delete`, `create` NX, `take` GETDEL; `credential:*` under
a shared `cwf:passkeys:` prefix, sessions/challenges per network); `server/session.ts` = passkey session or the social
session cookie (EIP-191 via `auth/verify.ts`, HMAC `SOCIAL_SESSION_SECRET`).

**C.3.3 Relay:** `/api/relay` (POST; parse JSON-RPC method, `Handler.relay({ feePayer: { account, feeToken:
pathUSD, validate: policy.validate({method, device, region}) }, chains, path })` created once at module scope, `validate` reading the request context; nodejs, maxDuration 60) and
`/api/relay/status` (fee payer, balance, breaker, allowlist, today's budget). Policy engine order: chainId → `from` ≠
fee payer → geofence area → `calls ≤ 8`, value 0, no CREATE → every `to` in area targets ∪ USD TIP-20s/mirrors (approve
only) ∪ Permit2 (approve) ∪ AccountKeychain (`revokeKey`, themes) → every selector in `sponsor[]`; any `never[]` selector
refuses the tx → approve spender in targets, amount ≠ max → async sender rule (vault `placeFor` requires
`grantOf(id).actor == from && isGrantLive`; games picks require `agentOf == from`) → gas ≤ area cap → fee token pathUSD →
expiring `validBefore ≤ now + 300` → gates (per sender/hour, device/hour via `x-cwf-device`, device/day fee, global/day
fee, low-balance breaker) counted over `relay_sponsorships`, **debited only on raw-sign/send**. Policies resolve
selectors by function name from generated ABIs (can't drift).

**C.3.4 Faucet:** `/api/faucet/challenge` + `/api/faucet` (verify signature → quota in `faucet_claims` → `tempo_fundAddress`
→ 4 tx hashes); mainnet answers 404 with funding options (L-26).

**C.3.5 Geofence:** `web/src/proxy.ts` + `lib/region-mark.ts` (Agari): lists `markets: {US}`, `stocks: {US, CA, GB, CH}`,
`launch: {}` (Q-008); headers `x-cwf-region-markets/stocks`, cookie `cwf.region`, override `CWF_REGION_OVERRIDE`; funded
routes check the header; the relay refuses those areas' entry selectors for restricted regions; exits stay open
(withdraw, redeem, claims, cash-out, sell, bridge-out, unfollow); disclosed as posture, not on-chain enforcement.

**C.3.6 `/dev/*`:** `app/dev/layout.tsx` → `notFound()` in production unless `DEV_FIXTURES=1`; proxy 404; robots disallow.

**C.3.7 Masayume pages:** `/` → Agari landing (S1 shell, S20 content); `/markets` (S4, +S6/S7/S10); `/markets/[id]`
renders with OG (S1/S5); legacy redirects kept (S1); `/reels` (S13); `/portfolio` (S4 + vault S7, stocks S15, themes S16,
launches S17, bridges S14); `/portfolio/edge` (S5); `/earn` 4-tab (S8); `/parlay`, `/surface` (S10); `/leaderboard`,
`/stats`, `/status`, `/news` (S5); `/how-it-works`, `/download`, `/demo`, `/pitch` (S20); `/strategies`, `/agents` (S9;
Themes tab S16); `/trade-from-x`, `/claim` (S11); `/native-auth` app handoff (SM2); `/games` + practice/lucky/arcade
(S12a); duel/history/rank (S12b); `/games/{range,moonshot}` (S10b); `/dev/*` gated (S1).

**C.3.8 Masayume API routes:** faucet → C.3.4 (S1); `sponsor` removed → `/api/relay` (S1); `private/*` desk self-pays,
EIP-712 claim, committed secret, verifier (S10d); `room/*`, `takes` via verifier + position gate (S13); `sensei` brain +
optional MPP (S13); `news` + Finnhub, `leaderboard`, `traction`, `status` over idx (S5); `strategies/*` (S9);
`games/arcade/*`, `games/lucky/*` (S12a); `games/{history,rank,season,occupancy,room-token}` (S12b); `games/sponsor` GET
only (S12b); `x/*` with verifier (S11).

**C.3.9 Agari additions:** landing + OG images (S5/S20); `/tickers/[symbol]` + "Stock Token on Tempo" card (S6/S13/S15);
`/u/[address]` (`isAddress`; S13); `/activity` + `/api/activity*` (S13); `/proof/[market]` with browser `eth_call`
reverify (S5); `/api/social/*` (S13); `/api/index/[...path]` (S3); `/api/earnings` (S6); `/api/sentiment` (S13; marquee
S1); `/api/strategies/memory*` (S9); `/api/games/achievements` (S12a); `proxy.ts` (S1). Dropped: Blinks (→ `/go/*`
share-to-sign links, S11), Helius holdings (→ `/api/stocks/holdings/[address]`, S15), Pyth proof posting, sponsor
co-sign, SOL faucet leg; `/api/prestocks` → G-05 paused (S6).

**C.3.10 New surfaces:** `/stocks`, `/stocks/[symbol]` (catalogue; buy/sell; holdings in UI amounts; reserve panel;
bridge CTA; weekend signal; calls on this ticker; hedge card; disclosure), `/bridge` (two-wallet flow, LayerZero quote,
in-flight list, testnet two-leg display), `/reserves`, `/settings/{account,notifications}`, `/privacy`, `/terms`, `/contact`,
`/themes`, `/themes/[slug]`, `/themes/create`, `/launch`,
`/launch/stablecoin`, `/launch/meme`, `/launch/[token]`. APIs `/api/stocks/{list, holdings/[address], reserves,
bridge/[guid]}`, `/api/themes/{list, [id], [id]/followers, [id]/nav, [id]/agent-key}` (agent-key proxies to ops
`/internal/theme-keys` with `OPS_INTERNAL_TOKEN`; key material never on Vercel), `/api/launch/{list, [token],
[token]/trades}`, `/api/prices/{redstone-payload, datastreams-report}` (server-side same-call signed prices; Data
Streams key server-only), `/api/agents/[strategyId]/registration.json`.

### C.4 Indexer and data

**C.4.1 Log follower** (`services/ops/src/actors/indexer/`): `sources.ts` (fragments + pinned externals:
ReceivePolicyGuard `TransferBlocked`, AccountKeychain events for our theme keys, PoolManager `Swap` for our poolIds,
our TIP-20 `Transfer`s; cursor per `(chain_id, address)`), `window.ts` (≤ 100k-block backfill windows, 2,000 live, halve
on provider errors; Tempo to `latest`, Robinhood/Base to `finalized` → no reorg handling), `fetch.ts` (one `eth_getLogs`
per chain per window), `decode.ts` (generated per-area unions), `apply.ts` (one DB tx per window; `idx_events` keyed
`(chain_id, tx_hash, log_index)` `ON CONFLICT DO NOTHING RETURNING` → idempotent projections → cursor), `gaps.ts`
(`(marketId, seq)` continuity; rebuild that market's projections on a gap), live poll 1,000 ms (WS `newHeads`
optional), publishes applied engine events to the `/stream` SSE.

**C.4.2 Projections:** kept from Agari (adapted keys; Solana columns dropped): `idx_series, idx_markets, idx_prints,
idx_orders, idx_fills, idx_positions, idx_candles`; added `idx_redemptions`, `idx_credits`, `idx_vault_{accounts,grants,
executions,settlements}`, `idx_parlay_tickets`, `idx_range_positions`, `idx_leverage_positions`, `idx_maker_windows`,
`idx_strategies`, `idx_subscriptions`, `idx_agent_feedback`, `idx_token_transfers` + `idx_token_holders` (our tokens
only), `idx_transfer_blocked`, `idx_access_keys`, `idx_pool_swaps`, `idx_pool_liquidity`. duel-projector consumes
`idx_events` through `game_cursors`.

**C.4.3 Tempo Indexer API** (`indexer-api/client.ts`, `tidx.ts`, API key or MPP session on mainnet): hourly recount per
event via `signature=` vs `idx_events`; backfill fallback; `/stats` analytics.

**C.4.4 Print archive:** `print_archive` (source ∈ redstone/datastreams/attested/pyth-imported); feeds = 9 names +
`---EXTENDED` + `---24_7` + BTC/ETH/SOL + `NY_MARKET_NEXT_CHANGE_TIME`; Data Streams full reports; `print_proofs` =
re-verification cache; `scripts/archive/import-agari.ts`.

**C.4.5 `/api/index/*`:** `markets`, `markets/[id]`, `wallet/[addr]/{fills,positions,actions,history,vault,claims}`,
`fills`, `prints/[id]`, `candles/[id]`, `status`, `archive/[symbol]`, `proof/[id]`, `tape`, `stocks/*`, `themes/*`,
`launch/*`, `bridge/[guid]`, `agents/*`; public `s-maxage=2`, wallet `no-store`.

**C.4.6 New tables** (`packages/db/migrations/<area>/NNNN_*.sql`): `relay_sponsorships`, `mpp_receipts`,
`agent_registrations`, `themes`, `theme_follows`, `theme_agent_keys` (ops only), `theme_rebalances` (+ decisions),
`theme_nav`, `launches`, `launch_trades`, `bridge_messages`, `stock_sync_messages`, `reserve_snapshots`, `price_ticks`
(30-day retention), `push_devices`, `push_prefs`, `push_outbox`, `notify_cursors`, `live_activities`, `oauth_states`,
`social_reports`, `social_blocks`.

**C.4.7 `packages/db`:** `client.ts`, `migrate.ts` (advisory lock; ordered files into `schema_migrations`); areas
social, faucet, games, x, strategies, index, index-products, prints, relay, mpp, agents, stocks, themes, launch; one
database per network.

### C.5 Ops and brain

**C.5.1 Host:** Agari `runtime/{actor,heartbeat,env,keys}.ts` + `main.ts` (`runActor`; DRY_RUN unless `0|false`;
missing key forces dry; start failure exit 78; stuck pass exit 70; redacted JSON why-strings); keys from
`<ROLE>_PRIVATE_KEY` or `~/.config/cwf/<network>/<role>.json`; one HTTP server on 8080 (`/health`, `/session`,
`/prices/{latest,history}`, `/stream` (the single D40 SSE, topic-multiplexed: prices, fills, verdicts, rooms, takes,
activity; served as `stream.<domain>` with CORS for our origins and a short-lived stream token for per-user topics),
`/rooms` WS only for posting, `/occupancy`, `/internal/theme-keys`); actors
self-pay in pathUSD; the theme agent co-signs with `OPS_FEE_PAYER_PRIVATE_KEY`.

**C.5.2 Actors:** archive (S0) → price-relay (RedStone → `recordPrint`, Data Streams on mainnet, EIP-712 attestations,
copy-open) · window-roller (Agari planners; crypto 24/7) · settler (settle/void/sweep/`redeemFor` after 300 s; skips
opted-out products; `EventVault.crankSettle` worklist) · indexer · seed-maker (Agari fair value + crypto σ) ·
earn-quoter (runActor; custody assert; per-Window P&L) · halt-watch (RedStone staleness/signers, DS `marketStatus`, Alpaca
status) · earnings · calendar (RedStone schedule ∩ Alpaca) · spot/stream (RedStone 10 s + DS → SSE, `price_ticks`) ·
strategy-runner + `runner-main.ts` (STRATEGY grants, expiring nonces, decisions before send, MPP receipts, fade) ·
x-relay (EXECUTOR; dry-run added) · leverage-keeper · game-room, matchmaker/deckmaster · duel-projector / duel-settler ·
theme-agent/rebalancer · stock-sync (Robinhood key) · reserve-watch · bridge-watch · guard-reference-writer ·
launch-keeper · funds-watch (role/relay/MPP balances; Moderato auto top-up) · agent-rater (dry default) · notifier
(push + Live Activity updates, D.6) · moderation (report queue, S13). Common env:
`NETWORK`, `TEMPO_RPC_{HTTP,WS}_URL`, `RH_RPC_HTTP_URL`, `BASE_SEPOLIA_RPC_HTTP_URL`, `DATABASE_URL`, `DRY_RUN`,
`OPS_ACTORS`, `OPS_HTTP_PORT=8080`, `OPS_STUCK_PASS_MS`, `OPS_INTERNAL_TOKEN`.

**C.5.3 Brain + MPP:** port Masayume `packages/brain/src/{model,agent-read,agent-decide}.ts`; `resolveModel({ fetch?,
via })` with `via: 'mpp'` → `createAnthropic({ baseURL: 'https://anthropic.mpp.tempo.xyz/v1', apiKey: 'mpp', fetch })`
(same for other MPP hosts); payer = `Account.fromSecp256k1(MPP_PAYER_PRIVATE_KEY, { access: MPP_ROOT_ADDRESS })` (an
access key with TIP-1011 periodic limits on USDC.e/pathUSD), fallback software caps; `Mppx.create({ polyfill: false,
methods: [tempo({ account })] })`; receipt hook reads `Payment-Receipt` into `mpp_receipts` linked via AsyncLocalStorage
(`withReceiptScope({decisionId|rebalanceId|senseiId})`); charge intent preferred, session recorded as channel + voucher.

### C.6 Infrastructure

Web: two Vercel projects (`testnet.<domain>` → Moderato, `<domain>` → mainnet), region iad1, previews use their hostname
as rpId. Ops: two Fly apps (`cwf-ops-testnet`, `cwf-ops-mainnet`), one machine each, `/data` volume, `node:24-slim`.
Data: Neon Postgres ×2 (pooled URL for web with `prepare:false`, direct URL for ops/migrations); one Upstash Redis.
Passkeys: `PASSKEY_RP_ID = <registrable domain>` shared (domain needed before the S1 gate). Secrets (`infra/secrets.md`,
names/locations only): relay fee payers, desk key, ops role keys (×2), Robinhood/Base keys, MPP payer + root,
`THEME_KEY_KEK`, `OPS_INTERNAL_TOKEN`, `STREAM_TICKET_SECRET`, `ROOM_TOKEN_SECRET`, `SOCIAL_SESSION_SECRET`, `DATABASE_URL`s, `KV_REST_API_*`, AI
keys, X OAuth + rettiwt cookies, Finnhub, Alpaca, Data Streams key/secret, Tempo Indexer API key, Robinhood RPC provider
key, Safe signer addresses, APNs key (`.p8`, key ID, team ID), FCM service account, Reown project ID, EAS token (CI),
Android upload keystore (EAS-managed). `/status` probes: chain-id round trips, index head lag, oracle freshness, ops heartbeats,
relay balance + breaker, funds-watch, LayerZero `quoteSend`, v4 StateView, last reserve snapshot, MPP wallet, DB/KV,
commit SHA, "closed (expected)" off-hours. CI: `ci.yml` (install, typecheck, invariants, test, codegen:check, build),
budgets (Lighthouse CI + analyze) in `ci.yml`, `contracts.yml` (Foundry ≥ 1.8.3, both profiles, sizes, tests), `nightly-fork.yml`, `deploy-ops.yml`.
