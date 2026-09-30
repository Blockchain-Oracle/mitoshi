# Decisions and questions

Append-only. A plan change is a new D-entry that names what it supersedes. Owner answers are D-001…D-009;
design decisions from the planning passes are D-010…D-057 (plan §1.2 D1…D48, numbered D-(n+9)). Open questions are
Q-entries with a default that applies until answered.

## Owner answers

### D-001 — owner answer (2026-09-21)

Stock-token source = **Robinhood Chain**.

### D-002 — owner answer (2026-09-21)

Themes = **per-user accounts**: the user holds the mirror tokens; the theme agent trades through a Tempo access key; per-follower caps live in the ThemeRouter follow record (no separate KeyPolicy contract).

### D-003 — owner answer (2026-09-21)

Trading Balance = **Masayume's EventVault ported as-is** (custody, SESSION/EXECUTOR/STRATEGY grants, caps in the vault, `crankSettle`, VaultTally). Only the ERC-2771 forwarder goes; our fee relay replaces it.

### D-004 — owner answer (2026-09-21)

Build **in this repo**, pnpm monorepo in Masayume's shape.

### D-005 — owner answer (2026-09-22)

**Mobile app on iOS + Android** (one Expo codebase; Android ships as a directly installable APK).

### D-006 — owner answer (2026-09-22)

**iOS distribution = TestFlight:** a testnet build on a **public TestFlight link** (one Beta App Review) with **internal TestFlight** (no review) as the guaranteed path. Not unlisted (full review + separate request; Apple declines beta apps).

### D-007 — owner answer (2026-09-22)

**Architecture = native shell + web screens:** native tab bar in Masayume's pill design, native passkeys, push, haptics, biometrics, Secure Enclave keys; product screens are the live web app; hot paths move to native.

### D-008 — owner answer (2026-09-22)

**Apple account = individual.** Fine for TestFlight; a public/unlisted listing later needs an organization account.

### D-009 — owner answer (2026-09-29)

**UI direction = keep Masayume's look, revamp the UX:** Masayume's identity (colours, type, nav, layout) and every flow stay; new surfaces (stocks, bridge, reserves, themes, launch, settings, mobile) are built from 21st.dev components restyled to Masayume's tokens, and ported screens with weak UX are rebuilt from 21st components too.

### Standing instructions (owner, 2026-09-29)

**Standing instructions (owner, 2026-09-29), applied to every stage:** UX matters "1,000%"; search 21st.dev for the right component and revamp it — don't design components from imagination; "understand the libraries" means read their docs through Context7 and follow the recommended patterns; architect for performance; tests are not a deliverable but are written to prove important functionality works. **Owner overlay rule (Masayume ledger 2026-09-04, owner-directed):** centred modals and the right-edge slide-over; **no bottom sheets** (OS share sheets excepted; ledger `parity-ledger.md:47,65,69`).

## Design decisions (plan §1.2)

### D-010 (plan D1)

**Engine = Agari's semantics in Solidity, policy-free.** One ERC-7201 storage layout; external libraries `MatchLib`, `AdminLib`, `ResolveLib` (delegatecall) + `EventsEngine` + a separate `EngineLens` reading via `extsload`

**Why:** Fits EIP-170; no diamond (no upgradability, P7); no KeyPolicy hook (owner answer 3)

### D-011 (plan D2)

**Recycled global order-node pool** with FREED sentinels (never zeroed; reuse ~5k/slot), monotonic `seq`, uint128 handles `mIdx‖seq‖node`; **2-slot positions** (slot A is all a plain taker touches); per-holder order list threaded through nodes; `reserveNodes` pre-grows the pool

**Why:** Tempo charges 250k gas per new slot; first order ≈ 350k cold → ≈ 110k with storage credits

### D-012 (plan D3)

**Native ABI shaped like `IDreamDex`; the seven Masayume seams are rewritten against it through an internal `EngineSeam` library — no façade contract**

**Why:** A façade can't serve DreamDEX's per-market-address model, would double the ledger and hide the `PlaceResult` the accounting assert needs

### D-013 (plan D4)

**Units:** raw quantity = lots × lotBase (1000); priceRaw = ticks × tickBase (1000); `expireNs/1e9` → seconds at the seam; seams use **`lockAt`** for trading-time checks and **`expiry`** for settlement (they differ on Gap Windows)

**Why:** Masayume assumes 1 raw outcome unit = 1 base unit of payout

### D-014 (plan D5)

**Every payout pre-checks the receive policy.** Engine `redeemFor` holds a blocked payout as credit; products use a shared `Payouts._payOrOwe` (owe + `claimOwed`)

**Why:** Receive-policy blackhole strands funds; D-114 pattern

### D-015 (plan D6)

**Products opt out of third-party `redeemFor` cranks** (`setCrankOptOut`)

**Why:** A crank would dump pooled payouts into the product and break per-owner attribution

### D-016 (plan D7)

**Verifiers are separate stateless contracts with immutable signer sets:** `RedStonePrintVerifier` (our port of Agari's parser; exact-T replaces RedStone's ±3 min default), `DataStreamsPrintVerifier` (v11 decode pinned from a real report), `AttestedPrintVerifier` (EIP-712); **`FairValueGuard`** for PD-2

**Why:** Admin cannot re-point listed Windows' prints; RedStone BUSL contracts avoided

### D-017 (plan D8)

**MakerGateway escrow becomes a measured delta;** every credit collection (incl. third-party sweeps) is booked

**Why:** Our engine never refunds lazily into a placement

### D-018 (plan D9)

**Masayume's contract test suites run against the real engine** as the proof that each seam is correct (Book seeder replaces mock knobs); one `LyingEngine` fault-injection mock proves each product's accounting assert; golden vectors reused unchanged

**Why:** Real integration; conversions are exact so vectors stay bit-identical; the suites prove the seams (tests are proof, not a deliverable)

### D-019 (plan D10)

**Strategy metadata via SSTORE2** (code bytes 1,000 gas/B vs slots ≈ 7,800 gas/B); **written only by the root key** (Tempo refuses any CREATE in an access-key tx, `spec-tempo-transaction.md:768`), never by the runner or an agent key

**Why:** A 2 KB persona ≈ 2.6M gas instead of ≈ 16M

### D-020 (plan D11)

**Bridge:** immutable per-ticker `StockLockbox` (no proxy on the side holding real assets); adapter behind a proxy; `_credit` **never reverts** (defers: claim or resend) except the lockbox's outstanding-underflow guard; `StockSync` full-snapshot codec with `(srcTimestamp, seq)` ordering; one `ScaledUIView` per mirror

**Why:** A revert inside `lzReceive` strands bridged funds; a forged over-release must stay stuck, not drain

### D-021 (plan D12)

**v4 on Moderato = replay 7 mainnet CREATE2 txs** (PoolManager, descriptor impl + proxy, PositionManager, V4Quoter, StateView, UR `0xa2dc`); WETH9 is not replayable (a V2 factory sits there on Moderato) — native paths never used; **pinned UR `0xa2dc…ea91`** on both networks

**Why:** Address and runtime parity with mainnet

### D-022 (plan D13)

**StockGuardHook flags `0x20C0`** (beforeInitialize + beforeSwap + afterSwap), static fee, no return deltas; band from a `StockReference` store; **pool raw price = underlying × `uiMultiplier`**

**Why:** A beforeSwap-only hook can't bound the post-swap price (the router passes extreme limits); still needs no routing allowlist

### D-023 (plan D14)

**ThemeRouter = `IUnlockCallback`**, settles each currency as `PM.sync(c)` → `transferFrom(follower, PM)` → `PM.settle()` (v4 docs), no Permit2/UR, recipient structurally `msg.sender`; per-(follower, theme) secp256k1 keys created and held by ops (AES-GCM; KMS-wrapped on mainnet)

**Why:** Router/Permit2 recipients aren't bound by access keys; blast radius = one user

### D-024 (plan D15)

**Memecoin:** singleton `CurveLaunchpad` (concentrated-liquidity segment maths, v4-core `SqrtPriceMath`), pre-graduation compound TIP-403 policy blocks the PoolManager, permissionless `graduate()` into a hookless pool + `LiquidityLocker`, issuer and admin roles renounced after

**Why:** Blocks pre-seeding the migration pool; fixed supply after graduation

### D-025 (plan D16)

**Stablecoin:** one 9-call creator batch (createToken, roles, mint, DEX pair, flip orders ≥ 100 tokens, FeeAMM liquidity, registry) + currency-code guard

**Why:** Tempo-native; no launchpad custody

### D-026 (plan D17)

**Monorepo scope `@cwf/*`;** per-area deployment fragments `contracts/deployments/<chainId>/<area>.json` → codegen into `packages/clients`; invariant rules in `scripts/invariants`

**Why:** Parallel agents without merge conflicts; ABIs can't drift

### D-027 (plan D18)

**Wallet:** wagmi 3 + Agari's RainbowKit replica re-pointed at `webAuthn`, `tempoWallet()`, injected; **two-wallet model** (a secp256k1 wallet on Robinhood Chain for bridge-in); injected wallets get a reduced capability set on Tempo (they can't sign 0x76 txs)

**Why:** RainbowKit 2 needs wagmi 2; passkeys can't sign on Robinhood Chain

### D-028 (plan D19)

**Auth:** `Handler.webAuthn` + Upstash KV; one server verifier `packages/markets/src/auth/verify.ts` (viem Tempo `verifyHash`, authority = `SignatureVerifier` `eth_call`)

**Why:** Passkey/P-256/keychain signatures everywhere Masayume used EIP-191

### D-029 (plan D20)

**Relay:** `Handler.relay` built once at module scope (D46); `validate` reads per-request context (method, device, region) through AsyncLocalStorage; policy engine + per-area policy files in `packages/markets/src/relay/`; budgets debited only on raw-send methods in a Postgres ledger; EventVault sponsorship = unchanged from Masayume's list

**Why:** `validate` runs twice; serverless counters don't hold; ops co-signs with the same policy

### D-030 (plan D21)

**Indexer:** own EVM log follower (per-address cursors, ≤ 100k-block windows, deterministic finality, `(marketId, seq)` gap rebuild) + Tempo Indexer API for recount/analytics

**Why:** Works on both networks without keys; Agari's `idx_*` read model

### D-031 (plan D22)

**DB:** ordered migrations per area (`schema_migrations`) instead of an idempotent `CREATE` blob

**Why:** Rows must change over time

### D-032 (plan D23)

**Ops:** one Fly machine per network, one HTTP server on 8080, every actor on `runActor` (vault maker too), DRY_RUN default

**Why:** Single writer per key; health for all

### D-033 (plan D24)

**Brain:** `via:'mpp'` model routing + `mpp_receipts`; probe each MPP provider's intents first (session intent has no per-request receipt)

**Why:** Receipts are the agent thesis

### D-034 (plan D25)

**Hosting:** Vercel ×2 (testnet, mainnet), Fly ×2, Neon Postgres ×2, Upstash Redis; one registrable domain as passkey rpId

**Why:** Passkeys bind to the domain

### D-035 (plan D26)

**Archive takeover in S0:** an archive-only ops actor on Fly + import of Agari's laptop archive

**Why:** RedStone keeps ~24 h; the Friday Gap print must never be lost

### D-036 (plan D27)

**Mobile = Expo SDK 57 app in `mobile/`** (move to SDK 58 when stable). **One persistent `react-native-webview`** hosts the live web app (one React instance, one wallet session, one query cache, one set of streams). A **native tab bar reproduces Masayume's floating pill nav** (not iOS system tabs, so the look stays; haptics on press) and a **right-edge "More" panel with a search row** (owner rule: no bottom sheets) and drives the web app's router over the bridge

**Why:** Full parity and the exact design system on day one; several web views would run several copies of the app (duplicate sessions, streams and journals) and get killed under memory pressure; Masayume MIG00: "share domain/view models and reproduce the same flows", no second design system

### D-037 (plan D28)

**Account phase A:** the web app inside the web view keeps its `webAuthn` connector; the app carries `webcredentials:<domain>` (iOS) and Digital Asset Links `get_login_creds` (Android), so **the same passkey = the same Tempo account on web and app**. Android WebView in app mode reports origin `android:apk-key-hash:<hash>` → `Handler.webAuthn` origins gain it (the handler accepts an array)

**Why:** Apple: WKWebView passkeys work for services configured as associated domains; Android: `WebSettingsCompat.setWebAuthenticationSupport(…FOR_APP)` routes through Play services FIDO2 with the app's origin; Tempo derives the address from the passkey key and skips origin/RP checks on chain

### D-038 (plan D29)

**Account phase B (sequenced after phase A):** native owns the account — native passkeys (`react-native-passkey` + a small custom accounts adapter, since the SDK's `webAuthn()` doesn't pass `createFn/getFn`), **hardware session keys** (Secure Enclave P-256 on iOS, StrongBox/Keystore P-256 on Android, via a local Expo module; `prehash: true`, DER→(r,s), low-s) used as the EventVault SESSION key, an **injected EIP-1193/EIP-6963 provider** into the web views, and a Face ID/biometric app lock

**Why:** Hardware-backed tap-trading keys; the web replica modal already lists injected wallets

### D-039 (plan D30)

**Accounts SDK `mobileWebAuth` only for the "Tempo Wallet" option** (users who bring a wallet.tempo.xyz account), never for our own accounts

**Why:** Its passkeys belong to `wallet.tempo.xyz` (a different account); a WKWebView can't use passkeys for a domain we don't own, so Tempo Wallet in the app must go through the system auth session this adapter opens

### D-040 (plan D31)

**Push = direct APNs (token .p8) + FCM** from a new ops `notifier` actor; devices registered at `/api/push/register`; pushes for verdicts, alerts, agent fills, theme rebalances, bridge completions, duel matches, X receipts

**Why:** Background refresh on iOS is ≥ 15 min and often skipped — push is the only reliable channel

### D-041 (plan D32)

**Universal links / app links** for `/go/*`, `/markets/*`, `/stocks/*`, `/themes/*`, `/games/duel/*`, `/launch/*`, `/u/*`, `/native-auth` (AASA `applinks` + `assetlinks.json`); `/native-auth` becomes the real app handoff (X OAuth return via ASWebAuthenticationSession, Yosuku's pattern)

**Why:** Reconstructs Yosuku's native app flows (L-19)

### D-042 (plan D33)

**Build variants:** `testnet` (Moderato only, no mainnet code path — guideline 2.3.1(a) forbids hidden features) for TestFlight and the APK; `mainnet` variant built later for an organization account; separate bundle IDs

**Why:** App Review safety; mainnet listing needs an organization account

### D-043 (plan D34)

**App Review obligations built as product features (web too):** report / block / filter for rooms, takes, profiles, token and agent pages + published contact (1.2); in-app account deletion of off-chain data (5.1.1(v)); AI data-sharing consent for Sensei and agents (5.1.2(i)); privacy policy; 18+ age rating; export-compliance answers

**Why:** Required for review; good practice for the web product

### D-044 (plan D35)

**UI = Masayume's look + revamped 21st.dev components** (owner answer 9). Every UI step names its 21st starting component (Appendix E). Revamp recipe: pull code with `21st get <id>` (or `21st add`), then map colours/spacing to Masayume tokens (the `design-literals` rule), strip gradients and glass, use Base UI primitives only (Masayume already does), `motion/react` as `m.*` under `LazyMotion`, lucide icons, `@number-flow/react` for live figures, Masayume's `numbers` utility (Plex Mono), add loading/empty/error/stale/blocked states, ≥ 44 px targets, ≥ 16 px inputs, keyboard + visible focus, reduced motion; record each adoption in `docs/design/components.md` (21st id, source, changes)

**Why:** Proven components, one identity, no hand-invented UI

### D-045 (plan D36)

**Keep the references' state and copy grammar exactly:** the CTA names its blocker; every failure says whether money moved ("Nothing was taken"); ticket → The Call card → verdict stamp → cream receipt; "Returned" void card and "Paid automatically" (Agari); write journal + recovery toasts; the one-sentence tap-trading arm modal; named waits in duels; "Don't trust it. Click it." receipts; deep links that resolve to the next live Window

**Why:** The references' strongest UX (ux-audit §10)

### D-046 (plan D37)

**One ceremony to a funded, tap-ready account:** passkey sign-up → server faucet funds with no user signature (testnet) → the tap-trading arm offered in the same centred modal → first call; the 5-step tutorial folds into contextual first-use explainers

**Why:** Masayume needs 5–8 prompts cold → paid; target is 1 biometric, then 0 per tap (ux-audit fix 1)

### D-047 (plan D38)

**Two no-prompt trading paths:** (a) the Trading Balance session key (EventVault, D-003); (b) **wallet mode via a TIP-1011 access key** authorized in the sign-in ceremony (`webAuthn({ accessKey: { authorize: { expiry, limits: [pathUSD per day], scopes: engine place/cancel/redeem/withdrawCredit + pathUSD.approve(engine) } } })`); limits count `approve` amounts, so every tap is capped; the key is listed, spent and revocable in `/settings/account`

**Why:** Taps from the wallet with no prompt and no deposit step; the accounts SDK's documented access-key pattern; X20 proves the limit accounting

### D-048 (plan D39)

**Verdicts pin to the user's own position** (not the hero selection); settler auto-pays (`redeemFor`) and leftovers claim in one sponsored batch; fix the references' ClaimWinnings false "Paid" and "Placing…" during claims; the stake is remembered after a fill

**Why:** ux-audit fixes 2 and 4, bugs in §1–2

### D-049 (plan D40)

**One real-time layer:** one SSE stream per client from ops (`stream.<domain>`, Fly; long-lived, not a Vercel function) carrying prices, fills, verdicts, room messages, takes and activity; chain WebSocket logs for the user's own events; both write into TanStack Query with `setQueryData`, batched per animation frame; price queries `staleTime: Infinity`; components read with `select`; no polling in hidden tabs; charts updated with `series.update()` outside React

**Why:** The references poll ~30 hooks + ~12 timers (a room every 9 s even hidden); web-stack §3, §6

### D-050 (plan D41)

**Rendering:** Next 16 `cacheComponents` + React Compiler (Babel plugin; the experimental Rust compiler off); `agentRules: false` (16.3 `next dev` otherwise writes AGENTS.md/CLAUDE.md); `partialPrefetching: true` (one App Shell prefetch per route); each page = static shell + `'use cache'` metadata/history with `cacheTag` (refreshed by `updateTag` on resolve) + `<Suspense>` for live and per-user parts; `loading.tsx`/Suspense in every dynamic segment (the App Shell boundary under partial prefetching); the wagmi cookie read sits inside a Suspense-wrapped provider; **route-group provider split** (landing, docs, proof and status load no wallet stack); Route Handlers for auth, relay, stream-token minting and app APIs; pages kept alive by `<Activity>` (≤ 3 routes) reset transient state in `useLayoutEffect` cleanup or Link `onNavigate`, dialogs with init logic derive `open` from a search param, e2e uses `getByRole`/visible filters

**Why:** web-stack §1, §9; the references ship ~2.5 MB JS on every route

### D-051 (plan D42)

**Performance budgets enforced in CI** (§3.1)

**Why:** Performance is designed in, not audited at the end

### D-052 (plan D43)

**One `TxLifecycle` component family** for every write: idle → blocked(reason) → review → signing → submitted → confirmed → settled/delivered, plus failed(diagnosis, moneyMoved) and unknown (reconciling by `validBefore`); optimistic "confirmed-pending" with rollback; cream receipts with explorer links; "key used" receipts for access-key and session-key spends; confirmation tiers (tap-only under caps · passkey for root actions · typed confirm for irreversible creation); undo window for non-urgent revokes

**Why:** ux-audit §11.1

### D-053 (plan D44)

**`/settings/account` is the trust surface:** passkey devices + backup-passkey prompt after the first deposit; every live key/grant (tap, wallet, copy, X, duel, theme) with scope, remaining limit, expiry, last used, history, revoke and revoke-all; linked wallets (Robinhood, X); AI consent, export, off-chain deletion; biometric lock; region posture

**Why:** Delegated signing needs one place to see and stop it (ux-audit §11.8)

### D-054 (plan D45)

**Chain-library corrections (chain-libs.md):** SSTORE2 root-key only (D10); ThemeRouter `sync` (D14); the adapter proxy is `new TransparentUpgradeableProxy(impl, SAFE, initData)` (OZ 5.6 requires init at construction and creates its own ProxyAdmin) with `_disableInitializers()`; Foundry `network = "tempo"`, gas via snapshot cheatcodes + `--gas-snapshot-check`, no test relies on transient storage across calls (isolation); `afterInvariant()` runs the settle-and-redeem-everyone conservation check in every run; Solady `ffs/fls` return 256 on zero (guard empty words); `lnWad` refuses ≤ 0 (named error first, `fullMulDiv` for ratios); Sourcify verification at `contracts.tempo.xyz`; `@custom:storage-location` annotations; X7 also checks whether TIP-1016 is live

**Why:** Docs contradict four plan lines

### D-055 (plan D46)

**Web-library corrections (web-stack.md):** wagmi 3 names (`useConnection`, `getConnection`…); viem `withRelay` (not `withFeePayer`); `Handler.webAuthn`/`Handler.relay` built once at module scope; KV via Redis `Kv.from` with an atomic `take`; the relay route also catches `/api/relay/:chainId`; relay `features` off; `rpId` chosen once; `next/image` `preload` (not `priority`); `proxy.ts` runs on Node; accounts pinned `~0.18.4` (0.19 moves the relay toward `tapimo`, adopted by D-entry later); trades via `sendTransactionSync({ calls, feePayer: true })`

**Why:** Docs of the pinned versions

### D-056 (plan D47)

**Mobile-library corrections (mobile-stack.md), folded into Appendix D:** `injectedJavaScriptObject` on Android; exact-origin bridge checks; splash held until the web `ready`; opaque themed web view + `expo-system-ui`; Android pull-to-refresh on the web side; remount (not reload) after Android render-process death; Android passkeys via a `nativeConfig` web view subclass; per-topic Android channels before the permission prompt; both Live Activity push tokens; chart island ticks through `useDOMImperativeHandle`; `appVersionSource: remote`; MMKV v4 `createMMKV`; Reanimated 4 transforms/opacity only; the research's `formSheet` More and confirm sheets are rejected by the overlay rule (the More panel is a Reanimated right-edge view inside the WebShell route, closed by Android back; confirmations are centred `transparentModal` cards)

**Why:** Docs of Expo SDK 57 and its libraries

### D-057 (plan D48)

**Tests prove functionality; they are not a deliverable.** Each stage writes the tests that prove its money paths, encoders, protocol conversions and must-not-break flows; plans and gates never count tests

**Why:** Owner instruction 2026-09-29

### D-058 — figures use JetBrains Mono (correction, 2026-09-29)

Plan §2.2 and the 21st research said "Plex Mono" for numbers. Masayume 68f7a09 `web/src/lib/fonts.ts` and
`styles/bridge.css` (`--font-data`) use **JetBrains Mono**; it is authoritative (`docs/design/DESIGN.md`).

**Why:** fidelity to the reference; the plan text was wrong.

### D-059 — Tempo-profile forge scripts target a Tempo node (finding, 2026-09-29)

With `network = "tempo"`, forge can't parse a plain anvil receipt (deployBlock lost). Local runs use `anvil --network
tempo`; real runs use Moderato/Tempo.

**Why:** proven in S0.6's pipeline run (acceptance/S0.md).

### D-060 — name **Mitoshi 見通し**, domain `mitoshi.xyz` (owner answer, 2026-09-29)

"Outlook, forecast". Answers Q-019. The owner buys `mitoshi.xyz` on Namecheap (verified unregistered in the .xyz
registry 2026-09-29). Layout: `mitoshi.xyz` = mainnet web; `testnet.mitoshi.xyz` = testnet web; `ops.` / `stream.`
(per network, under `testnet.` for testnet) = ops health and the D-049 SSE stream; `docs.mitoshi.xyz` = docs (S20).
Passkey rpId = `mitoshi.xyz` on both networks. Brand strings live only in `web/src/lib/copy.ts`.

### D-061 — hosting on the owner's Coolify, not Vercel/Fly/Neon/Upstash (owner answer, 2026-09-29)

Answers Q-026 and supersedes D-034 (plan D25) and the Vercel/Fly parts of Appendix C.6 and plan §3. Coolify project
`mitoshi` on the owner's server: per-network web and ops apps built from Dockerfiles in the private repo, Coolify
PostgreSQL per network (replaces Neon), Coolify Redis per network (replaces Upstash; `Kv.from` over Redis with an
atomic `take`). Speed Insights → field metrics from the web app's own Web Vitals reporting; Lighthouse CI runs against
the testnet domain. Details: `infra/coolify.md`.

**Why:** the owner self-hosts everything on Coolify; one server, one bill, push-to-deploy.

### D-063 — spike X22: `createToken` is not CREATE; launches are never sponsored (finding + decision, S17a, 2026-09-29)

On Moderato an access key (keychain v2 signature) called `TIP20_FACTORY.createToken` and then signed the whole 9-call
stablecoin batch; both landed (`acceptance/S17.md`). The factory is a precompile call, not an EVM CREATE, so TIP-1011's
access-key CREATE ban does not apply: **stablecoin and memecoin launches may be signed by the user's access key or
passkey root** — no root-only path is needed. The stablecoin batch stays **unsponsored** (the creator pays its fee in
pathUSD): it is capital intake (bid escrow `amount × price` pathUSD + FeeAMM deposit), spans five targets and nine
calls (the relay allows one area and ≤ 8 calls), and `recordStablecoin` is only meaningful inside it
(`relay/policies/launch.ts` lists it under `never`).

**Why:** measured; keeps D-020 (capital intake never sponsored).

### D-064 — v4 replay and router ABI findings (finding, S15a, 2026-09-29)

Amends `docs/specs/v4-replay.md`: (1) row 7 (UniversalRouter) differs from mainnet only in its EIP-712 immutables
(chain id + domain separator of `EIP712("UniversalRouter", "2")`), exactly like row 4; verification masks both for
rows 4 and 7. (2) Spike X3: the pinned UR `0xa2dc` decodes v4-periphery #497 params — `ExactInputSingleParams` has 5
fields (no `minHopPriceX36`), `ExactInputParams`/`ExactOutputParams` carry `uint256[] maxHopSlippage` (per-hop maximum
`amountIn·1e18/amountOut`, empty = off). The one encoder is `packages/markets/src/v4/encode.ts` (`@cwf/markets/v4`),
proven by real mainnet calldata and fork execution. (3) Scripted testnet sends use `cast`, not viem (write-boundary).

**Why:** measured on both networks and on a Tempo mainnet fork (`acceptance/S15.md`).
### D-065 — engine ABI v1 freeze choices (S2.1–S2.6, 2026-09-29)

Refines App. A (`docs/specs/engine.md`) where it left the shape open, each choice the one most faithful to Agari:
`OpenWindowArgs` carries no policy version (the engine picks the highest covering one, E-26 step 10); one `seq` per
market-scoped call stamped on every event of that call; enums travel as `uint8` so bad bytes refuse by Agari's names;
`Market` stores prints as packed `uint128` (6 slots); `IPrintVerifier.verifyPrint` is non-view; all errors live in
`IEngineErrors` (inherited by `IEventsEngine`) with Agari codes as `@custom:agari`; `sweepExpired` walks the market's
own levels and visits ≤ 256 nodes per call (Agari scanned a ≤ 512-node slab); T05 (drain own orders) applies to
`redeem`, `redeemPartial` and `redeemFor`; `openWindow` writes only the non-zero market slots and refuses a `lockAt`
beyond uint32 (`BadHorizon`); `Redeemed` is emitted by the engine after pay-or-hold. Detail: stage-02 F-S2-04…F-S2-12,
`docs/specs/interface-checklist.md` §5.

**Why:** the frozen ABI (`engine-abi-v1`) is what every seam builds on; the spec changes only through D-entries.

### D-066 — print verifier refinements (S2.5–S2.7, 2026-09-29)

A policy version names its verifier contract, which must have code and answer `source()` equal to the policy's
source. RedStone: every posted package must be a valid (OZ `tryRecover`, low-s), distinct, configured signer —
unknown or malleated → `UnknownRedStoneSigner`, repeated → `DuplicateRedStoneSigner`, zero/oversized value →
`InvalidPrintValue` (Agari's SDK dropped such packages below N; same outcome, named — T02). Data Streams: a v11
`marketStatus` outside the policy mask refuses `InsufficientVerification`; the proxy is called non-payable (same
selector; Tempo has no value). Attested: EIP-712 `verifyingContract` = the calling engine; `verifySpot` signs a typed
`Spot(feedId, price, expo, observedAt)` under the same domain. Detail: stage-02 F-S2-10, F-S2-13.

**Why:** Agari's rules carried to Tempo's sources with every refusal named; replay bound to engine, chain, market and slot.

### D-080 — Tempo-side bridge gas: adapter lzReceive 1,000,000, `MIN_CREDIT_GAS` 600k, pre-warmed counters (finding, 2026-09-29)

Measured on a Moderato fork (block 37363418, real TIP-20 precompiles): a TIP-20 `mint` to a fresh holder costs
**510k** gas (TIP-1000 state creation), the whole adapter `lzReceive` 552k, and a first message on a path ~852k
including the endpoint's own first writes; a warm credit is ~56k. Plan B.1.4/B.1.5's "gas ≥ 400k" and "lzReceive
550k" would defer or fail fresh holders. So: `MIN_CREDIT_GAS` = 600k (below it `_credit` reverts, retryable); a mint
that runs out of gas reverts instead of deferring; enforced lzReceive gas on every sender **to** Tempo (lockbox →
30410, transit → 40444) = **1,000,000**; the adapter keeps `mintedNet`/`totalDeferred` stored +1 so they are never
zero→non-zero writes (each would cost 250k inside the credit).

**Why:** B.1.4's numbers predate TIP-1000; fresh-holder credits must not be deferred for lack of gas.

### D-100 — spike X4: the theme follow is one root tx `[authorizeKey, follow]` — one passkey prompt; split only past 5 tokens (finding + decision, S16c, 2026-09-29)

Measured on Moderato (`acceptance/S16.md`) with the exact B.4.3 restrictions over the five mirrors (6 daily limits,
7 target scopes, 6 recipient bindings): **17.48M gas** as a call `AccountKeychain.authorizeKey(...)` inside the root's
own batch, **17.43M** as a tx-level `key_authorization`; a 1-token key costs 7.37M, so each theme token adds ≈ **2.53M**
(its limit + its recipient-bound `approve@router` scope). A key authorized earlier in the same tx **is visible** to
`getKey`/`getAllowedCalls` in a later call of that tx (both shapes; `getTransactionKey()` = 0, root). T1A replaced the
16.7M per-tx cap with Tempo's 30M; TIP-1010's "> 16M not recommended" is advice, and the 18–19M follow landed in the
next block. Prompts: the `key_authorization` field needs the root to sign the authorization digest **and** the tx (two
passkey prompts); `authorizeKey` as a batch call needs one. So:
1. **Follow = one root-signed, relay-sponsored tx `[AccountKeychain.authorizeKey(keyId, secp256k1, restrictions),
   ThemeRouter.follow(...)]` — one prompt** — for themes with ≤ 5 tokens (all testnet themes, Q-004; `follow`
   itself measured 0.93M on a Moderato fork against the deployed router → ≈ 18.4M per follow tx). The tx-level `key_authorization` shape is not used (same gas, one more prompt).
2. **Past 5 tokens** (tokenCount ≤ 16; 16 tokens ≈ 45M), split: tx 1 = `[authorizeKey(all limits; router + pathUSD +
   the first 5 token scopes), follow]`, tx 2+ = `setAllowedCalls` chunks of ≤ 5 targets (≈ 10.2M each; one prompt
   each). `follow` therefore checks that every scope present is allowed (subset), not that all theme tokens are
   scoped; the rebalancer only trades tokens whose `approve@router` scope exists (`getAllowedCalls`).
3. A key's self-paid fee counts against its pathUSD limit (625 units on the approve+rebalance tx), so the agent's
   rebalances stay relay-sponsored (research 16 §4.6).

**Why:** measured; one prompt is the UX the follow modal promises (stage 16: "1–2 prompts"), and the gas fits the
30M per-tx cap with margin at the testnet theme size.

### D-101 — ThemeRegistry lists a token only through a Safe-recorded guarded pool; the guard is an interface (decision, S16c, 2026-09-29)

B.4.1's "tokens allowed only with a registered guarded `(pathUSD, token)` pool" is enforced as: the owner (Safe) sets
the StockGuardHook once (`setGuard`) and records each mirror's `PoolKey` (`setTokenPool`), which must have currency0 =
pathUSD, currency1 = the mirror and hooks = the guard, and which the guard must report through
`IThemePoolGuard.isGuardedPool(key)`; `publish`/`publishVersion` re-check that live, so a guard swap delists nothing
retroactively but blocks new versions on pools the new guard doesn't know. The router takes each leg's `PoolKey` from the
registry. **S15b's StockGuardHook must expose `isGuardedPool(PoolKey) → bool`** (true after `registerPool`). Band rules:
per band min ≤ target ≤ max ≤ 100 %, tokens need max > 0, targets (tokens + cash) sum to exactly 100 % — which already
implies Σ min ≤ 100 % ≤ Σ max, so no separate feasibility check. Deploy order: the registry deploys now with no guard;
`setGuard` + `setTokenPool` × 5 run after S15b–c register the pools (plan "16c.4 deploy after S15b–c").

**Why:** the hook doesn't exist yet; an interface plus a Safe-recorded key keeps the pool choice explicit (fee/tick
spacing come from S15c's pools, not guessed) and lets the registry deploy today.

### D-102 — ThemeRouter details the plan left open (decision, S16c, 2026-09-29)

1. **Fee base** = Σ buy `amountIn` + Σ sell `minAmountOut`, × the theme's `creatorFeeBps`: known before the swap, so
   the key's pathUSD approval (buys + fee) is exact. Fees accrue to `feesOwed[creator]`; `claimFees` pays the caller
   after a receive-policy pre-check.
2. **Exact approvals are enforced**, not assumed: after settlement any allowance left from the follower to the router
   on a touched token reverts `AllowanceLeft` — a standing approval would let the router's `transferFrom` bypass the
   key's TIP-1011 limit (research 16 §4.4).
3. **Root path** (`getTransactionKey() == 0`) skips the follower's own caps (expiry, per-leg, daily, caps interval and
   slippage, envelope) and keeps every theme rule (version, allowlist, `allowed`, interval, session, reference age,
   theme slippage, guard). Exact-in legs must fill completely (extreme price limits; a range-edge stop reverts
   `PartialFill`). Slippage is one-sided against `P_i` (a better price passes).
4. **Prices** come from `IThemeOracle.tokenPrice(mirror) → (usdPerTokenE18 = share × multiplier, observedAt, halted)`
   and `currentSession()`; **S15b's StockReference must expose this view** (or a thin adapter over `read` + the
   multiplier). A `priceProof` is forwarded as raw calldata to the Safe-set `proofTarget`, only for Safe-allowlisted
   push selectors (RedStone's payload rides in calldata, so a wrapper can't carry it).
5. **Key-signed flows are tested in forge**, not only on anvil/Moderato (amends B.6): `test/lib/KeychainTx.sol`
   builds the keychain V2 signature and `vm.executeTransaction` runs it through Tempo's real handler (scopes, limits,
   `getTransactionKey()`), including in the invariant handler.

**Why:** each is either needed for exactness (1, 2), stated by B.4.2 (3), or keeps the router independent of S15b's
unbuilt ABI (4); (5) is measured to work (X4 local half).

### D-095 — spike X5: the compound policy keeps the coin out of the PoolManager; mint recipients too (finding + refinement, S17b, 2026-09-29)

On the local Tempo EVM (`test/spikes/X5CompoundPolicy.t.sol`, PoolManager = the mainnet runtime fixture) a TIP-20 under
compound policy `(1, blacklist{PoolManager}, …)` refuses every path into the PoolManager — `transfer`, `transferFrom`
and v4's own `sync → transfer → settle` all revert `PolicyForbids` — while mints to buyers, transfers into the launchpad,
the launchpad paying out and the issuer burning all work; after `changeTransferPolicyId(1)` the same settle succeeds.
The spec's third member `1` would let a **mint** land in the PoolManager (measured: `mint(PoolManager)` succeeds under
`(1, bl, 1)`); the launchpad never mints there, but the curve policy is `(1, bl{PM}, bl{PM})` so no mint can either —
graduation flips to policy 1 before its own mints. Live confirmation on Moderato: `acceptance/S17.md` (S17b rows).
Refines B.5.2 `curvePolicyId`.

**Why:** measured; the stricter mint member costs nothing and closes a path the spec left open.

### D-096 — the memecoin launchpad ships with LaunchRegistry v2, owned by the launch lane key (decision, S17b, 2026-09-29)

`LaunchRegistry.setCurveLaunchpad` is owner-only and the S17a registry (`0x9b66…50b7`) is owned by the shared
`deployer` key, which lanes no longer broadcast from (per-lane keys, S0.10). So `DeployCurveLaunchpad.s.sol` deployed
a fresh registry (same code) owned by `deployer-launch` `0x64B7…1c96` and bound it to the launchpad:
`0x8248…94A3` is now `LaunchRegistry` in `deployments/42431/launch.json`; the S17a registry stays in `history[]`. The
two S17a test stablecoins remain on chain; only their admins can list them in v2 (`recordStablecoin`). The script
also accepts `LAUNCH_REGISTRY=<existing>` for a deployment whose registry owner binds the launchpad itself. A first
launchpad deployment (`0xd28e…2a0F`, 06:28 UTC) was superseded at 06:39 so the deployed source matches the
repo after two invariant fixes (non-payable PositionManager interface; `claimLeftover(address coin)`); it stays in
history. Testnet owner and protocol treasury = the lane key (Q-016).

**Why:** keeps the per-lane nonce rule without blocking the live gate; nothing of value lived in registry v1.

### D-097 — graduation and locker details the spec left open (decision, S17b, 2026-09-29)

Refines B.5.2. (1) The corrective swap is exact-input with the target as its price limit, run inside
`PoolManager.unlock` under `try`: raising the v4 price sells freshly minted coin (≤ 10 % of `migrationCoinAmount`,
reserved in the supply check: `totalSupply ≥ curveSupply + migrationCoin × 1.1`), lowering it pays pathUSD (≤ 10 % of
the migration quote; free in practice — no coin-side liquidity can exist before graduation). Short of the target →
the attempt rolls back, `TierSkipped(reason)` and the next tier; three tiers failing → `PoolPoisoned`, and the launch
stays Complete. (2) pathUSD the position cannot take (ratio rounding, the squatter's pathUSD the correction bought)
and the migration fee go to partner/creator by their trading-fee shares; the 0.2 % goes to the protocol treasury.
(3) The leftover (`cap − supply` after the position) is minted to the launchpad at graduation and paid to the
leftover receiver by `claimLeftover`, so supply is fixed at the cap before the roles are renounced. (4) The locker
splits LP fees by the liquidity partner and creator still have in the position (collected before every withdrawal);
rounding dust of the six floors stays in the position like locked liquidity. (5) A creator buy at launch pays the
base fee (not the anti-snipe start) and is capped at `maxCreatorBuyBps` of the curve supply. (6) `createLaunch`
refuses a symbol that isn't 1–8 ASCII letters/digits (the registry only matches reserved codes up to 8 bytes).
(7) Fees are pathUSD-side only, split protocol ≥ `minProtocolShareBps` (default 20 %) / partner / creator.

**Why:** each is the most conservative reading of DBC's mechanism on v4 + TIP-20; all measured in tests and live.

### D-098 — the launch keeper is opt-in and sends through the S1 submitter (decision, S17b, 2026-09-29)

`services/ops/src/actors/launch-keeper` is registered in `main.ts` but outside the default actor set (`OPT_IN`), so an
empty `OPS_ACTORS` does not start it; the S3 lane owns the deployed set. In the ops process it plans and simulates
(dry) until S1's `packages/markets/src/tx/send.ts` lands on the trunk and is wired as its `GraduateSender` — ops may
not send through viem anywhere else (write-boundary). The same pass, with a `cast` sender, graduated the live gate
launch (`scripts/drive/launch-meme.ts`). `graduate` is never sponsored: the keeper pays its own fee.

**Why:** keeps the write boundary and the S3 lane's deployment untouched while the keeper logic ships and is proven.
### D-105 — StockReference and StockGuardHook details the plan left open (decision, S15b, 2026-09-29)

1. **`pushRedStone(address[] mirrors, bytes[] payloads)`** — one payload per mirror. The RedStone wire payload the S2
   verifier parses is single-feed (`verifySpot` pins every package to one feed id), so B.3.2's `pushRedStone(mirrors[])`
   carries one proof per mirror. ThemeRouter forwards it as raw calldata (D-102 §4), so the shape is free.
2. **Older is ignored, bad is refused:** an observation not newer than the stored one emits `ReferenceIgnored` and
   returns (racing writers and theme proofs never revert each other); zero, > uint128, or > 60 s ahead reverts.
3. **Session:** `currentSession()` = the keeper flag while valid (`setSession(state, validUntil)`, TTL ≤ 1 day), else
   the last Data Streams v11 `marketStatus` if < 120 s old (2 → REGULAR; 1/3/4 → EXTENDED; 5 → CLOSED), else
   **UNKNOWN, which the guard treats exactly like CLOSED** (REFUSE or WIDEN). The keeper derives its flag from
   RedStone's **signed** `NY_MARKET_NEXT_CHANGE_TIME` (research 15 F16), not a hard-coded holiday table (Agari R-01).
4. **"Issuer-paused"** = the Robinhood token or registry pause mirrored by StockSync (`SyncFlags.isPaused`);
   "oracle-paused" = `ORACLE_PAUSED`; the mirror TIP-20's own `paused()` is a separate refusal (`MirrorPaused`).
   The CA window is |now − effectiveAt| < `caWindow` around a scheduled multiplier switch (`effectiveAt` 1 = none).
5. **Initialization** needs a registered pool, a fresh (closed-age) verified reference and a price inside the CLOSED
   band of share × the multiplier in effect — **not** a synced multiplier or inventory (Moderato inits before the
   bridge delivers; swaps then refuse `MultiplierUnsynced` until StockSync lands).
6. **The hook is also the themes seam:** it implements `IThemePoolGuard.isGuardedPool` (D-101) and `IThemeOracle`
   (D-102): `tokenPrice(mirror)` = share × multiplier with `halted` = any state-based block (keeper halt, no
   reference, unsynced, issuer/oracle/mirror pause, CA window, no pool); session and age stay the router's checks.
   So `registry.setGuard(hook)` and `router.setOracle(hook)` point at one address; `router.setProofTarget` = the
   StockReference.
7. **One pool per mirror** in the guard (`poolOf[mirror]`), static fee only, no unregister.

**Why:** each is forced by the verifier's wire format (1), keeps permissionless writers non-blocking (2), keeps the
off-hours rule conservative without a calendar table (3), or lets S16's deployed contracts use the guard unchanged (6).

### D-106 — the guard deploys as area `guard`, through Arachnid, avoiding `0x91…` and `0x20c0…` (decision, S15b, 2026-09-29)

`script/v4/DeployStockGuardHook.s.sol` mines the salt itself (HookMiner's CREATE2 formula, re-checked with
`HookMiner.computeAddress`) because `HookMiner.find` can't skip addresses: flags exactly 0x20C0, no code, first byte ≠
0x91 (Uniswap's routing allowlist, research 13 F30) and top two bytes ≠ 0x20c0 (TIP-20 address space — transfers there
revert). It calls Arachnid directly (Uniswap's own Tempo hook script does, so the 0x76 path can't change the deployer).
StockReference and the hook are recorded as a new deployment area **`guard`** (not merged into S14c's `stocks`
fragment, whose deployer differs) with relay policy `policies/guard.ts` (sponsors nothing in 15b). Moderato:
StockReference `0xccBc…Bd90`, hook `0xFB05…A0C0`, salt `0x3209`, owner = `deployer-products` (to the Safe with S19).

**Why:** the 0x20c0 exclusion is a Tempo-specific hazard the plan's "reject `0x91`" didn't name; a separate area keeps
S14c's fragment attribution intact.

### D-107 — NFLX: registered, no feed, not initialized until a signed source exists (decision, S15b, 2026-09-29)

B.3.4 wanted "NFLX pool small, guard-refused, UI says why". The guard initializes a pool only against a verified
reference (D-105 §5) and Tempo has no signed NFLX source (Q-011: RedStone lacks it; Data Streams needs credentials). So
the NFLX pool is **registered** (`isGuardedPool` true — ThemeRegistry can record it) with **no feed pinned**, and it is
**not initialized**; `bandNow(NFLX)` / `tokenPrice(NFLX)` report `NO_REFERENCE` / halted, which is what the UI shows.
It initializes (same script, `create-stock-pools.ts`) the day a Data Streams stream is pinned with `setFeeds`.
No keeper price is invented for it.

**Why:** a keeper-typed NFLX price would be fake backing for the band; honest pause is the rule (Q-011).

### D-070 — relay: debit at the fill, sponsored sends carry no fee fields, first-tx gas allowance (finding + decision, S1, 2026-09-29)

Amends D20 / D-055's "budgets debited only on raw-send methods". Measured on Moderato through our relay
(`acceptance/S1.md`, relay rows):

1. **accounts 0.18.4 co-signs at the fill.** `eth_fillTransaction` returns the transaction with `feePayerSignature`
   already attached; the client then sends the raw transaction straight to the RPC and never calls the relay again. A
   ledger that debits only raw methods records nothing. **Every approved co-signing method is debited**
   (`SIGNING_METHODS` = fill + raw sign/send); a raw sign/send reaches `validate` only when the fill did not sign.
   An abandoned fill therefore counts against budgets, which errs toward the relay.
2. **A sponsored send names no fee fields.** Moderato's `eth_fillTransaction` with `feePayer: true` and any explicit
   `maxPriorityFeePerGas`/`maxFeePerGas` estimates against the sender's balance and answers "gas required exceeds
   allowance (0)". `buildSendParameters` sets the explicit priority fee only on self-paid sends; the policy's gas cap
   bounds what the sponsor pays.
3. **TIP-1000 first-transaction gas.** A brand-new account's sponsored no-op fills with a gas limit of 274,577–294,577
   (the estimate includes TIP-1000's 250,000 account creation), yet the included transactions used 34,257: an
   expiring-nonce transaction leaves the protocol nonce at 0, so creation is estimated but not charged. The engine adds
   exactly `NEW_ACCOUNT_GAS` (250,000) to the area cap while the chain reports the sender's pending nonce as 0 (for a
   user who only ever sends expiring-nonce transactions that stays true). Without it, every new passkey user's
   sponsored call would be refused on the estimate.

**Why:** measured; without (1) the budgets are decorative, and without (2) and (3) no new user could be sponsored.

### D-071 — §3.1 budgets on Next 16: site pages gated on what they own; field vitals self-hosted (finding + decision, S1, 2026-09-29)

Measured on the production build (`pnpm perf:budgets`): Next 16.3 + React 19.2's own runtime (`rootMainFiles`) is
**127.6 KB gzip** — above §3.1's 120 KB first-load figure for landing/docs/proof before a single line of ours. So:

1. **Site routes are gated on owned JS** — first-load JS minus that framework floor — at **≤ 35 KB gzip** (now 32.0), and
   the floor has its own ceiling of **130 KB** so a framework upgrade that grows it fails CI. **App routes keep the
   §3.1 total, ≤ 250 KB** (now 217–222 KB). **CSS per route ≤ 55 KB gzip** (now 50.6; was 116 with next/font's CJK
   slicing). All three in `scripts/perf/route-budgets.ts`, run by `ci.yml` after the build.
2. **Field vitals without Vercel.** Speed Insights is Vercel-only and hosting is Coolify (D-061): a `web-vitals` beacon
   (loaded on idle; its buffered observers still see the page load) posts LCP/INP/CLS/FCP/TTFB with the route template
   only to `/api/vitals` (Postgres `web_vitals`); `GET /api/vitals?days=7` gives p75 per route — what S19 checks.
3. **Lab gate trigger.** `.github/workflows/lighthouse.yml` runs on `repository_dispatch` `coolify-deployment-success`
   (the Coolify deploy step sends `client_payload.url`) and by hand; no Vercel bypass headers.

**Why:** the gate must measure what the page controls; a budget below the framework floor is unmeetable, not strict.

### D-090 — S3 builds on S1's ports; the ops chain module is `@cwf/markets/ops` (S3.1, 2026-09-29)

S3 merges `stage/S1-web-shell` @ `082c13f` (as S3.5 did) instead of re-porting Agari's core planners: S1 already ported
`packages/core/src/market/*` (windows, calendar, RedStone schedule, halts, tickers, corporate, earnings) from Agari
03b30ab and `packages/markets/src/tx/send.ts`. The venue actors' chain I/O lives in `packages/markets/src/ops/*`
(`@cwf/markets/ops`: role clients, EngineLens reads through Multicall3, engine call builders, `sendOps` = simulate one
call, then `tx/send.ts` with an expiring nonce, self-paid in pathUSD) and `packages/markets/src/prices/*` (RedStone
payloads, EIP-712 attestations, Data Streams REST). "Fly config" in the stage box is the Coolify app (D-061): the
existing `services/ops/Dockerfile`, health `/health`, `DRY_RUN` default on.

**Why:** one copy of each planner; chain I/O stays in `packages/markets` (C.1.2 boundaries).

### D-091 — the testnet venue lists the nine RedStone stock names on every lane (S3.4, 2026-09-29)

`venue-spec.json` gains 63 Series (registered on Moderato, `acceptance/S3.md`): TSLA, NVDA, AAPL, MSFT, META, GOOGL,
AMZN, PLTR, AMD × Regular 5m/15m/60m (Agari's cadences), the weekend Gap (basis 1, cadence 604,800, primary open
admission `ADMIT_UNTIL_LOCK` as Agari's `policyVersions(…, "gap")`) and the 24/7 lane on RedStone `<T>---24_7` (basis 2,
5m/15m/60m; the registry's `stock24`). RedStone publishes no `PLTR---24_7` or `AMD---24_7` feed (gateway `latest`,
2026-09-29, found by halt-watch): their 24/7 Series stay registered and read "paused: no signed source" (the registry sets
their `redstone24x7FeedId` to null; the roller never lists them). SPCX waits for Data Streams (Q-011). Version 0 of every Series is RedStone
primary with no check source (the only keyless signed source on Moderato); a Data Streams check arrives as a new
policy version, never an edit. The node pool is reserved to 256 so the seed maker's quotes don't pay cold slots.
Measured cost: `openWindow` ≈ 1.07M gas at ≈ 2.7 gwei-equivalent in pathUSD, so all 66 lanes cost ≈ 3 pathUSD a day of
roller fees.

**Why:** the S3 gate needs a US session and a Gap; the registry already names these lanes (S1 `tickers.ts`).

### D-092 — the S3 soak's house taker and ops' public evidence routes (S3.8, 2026-09-29)

(1) The unattended soak needs fills to exercise settlement and auto-pay before any user trades, so ops has an opt-in
`house-taker` actor: the `keeper` testnet key takes one small IOC against the seed maker's best quote on a trading
24/7 Window every 15 minutes. It is never in the default actor set (nor `all`), is an operator wallet (excluded from
leaderboards and traction like the maker and settler), and its fills are labelled house activity in `/health`.
(2) Ops serves two read-only routes over public chain-derived data so the gate scripts run against production
without database access: `GET /index/recount?through=<block>` (block-pinned index counts and per-Window digests
for `scripts/drive/recount.ts`) and `GET /halts/log?from&to` (halt-watch's recorded observations for
`halt-replay.ts`). (3) Role keys are Coolify runtime-only variables; `OPS_DRY_ACTORS` rolls actors out of dry run one
at a time.

**Why:** the gate asks for auto-pay and recount/halt replay on the live venue; the Coolify Postgres is internal only (D-061).

### D-085 — spike X10 and the MPP payer (finding + decision, S3.5, 2026-09-29)

X10, the unpaid 402 probe (`scripts/mpp/probe.ts`, `acceptance/S3.5.md`): `anthropic.mpp.tempo.xyz/v1/messages` and
`openai.mpp.tempo.xyz/v1/chat/completions` answer with **four offers each — three `charge` (USDC.e
`0x20c0…b9537d11c60e8b50`, NANOUSD `0x20c0…8b4c619d2eedec7a`, pathUSD) and one `session` (USDC.e, escrow
`0x4d50…`)**, all on mainnet 4217 with the fee sponsored by the server; a fixed price per request by model (Sonnet/
Haiku/gpt-4o-mini 1,000 base = $0.001, Opus 5 1,200). The mpp.dev directory lists these hosts as session-only; the live
challenges are authoritative. **Decision:** the payer prefers **charge** (one TIP-20 transfer → on-chain `reference` per
request, D-033) and records session payments as channel + cumulative voucher. The payer is an **access key**
(`Account.fromSecp256k1(MPP_PAYER_PRIVATE_KEY, { access: MPP_ROOT_ADDRESS })`) authorized by the root with TIP-1011
**daily limits** (testnet 5 pathUSD; mainnet default 2 USDC.e + 2 pathUSD, the owner may change them) and scopes limited
to token `transfer`/`transferWithMemo` and the escrow; software caps (chain, currency, per-request, per-UTC-day,
reserved before signing) sit above it; every paid response becomes an `mpp_receipts` row scoped by
`withReceiptScope`. Mainnet refuses to build a payer unless `MPP_MAINNET_APPROVED=1` (Q-020). Testnet proof uses
`mpp.dev/api/ping/paid`, a Moderato charge endpoint (0.1 test pathUSD). The testnet roles are `mpp-root` / `mpp-payer`.

**Why:** measured (X10 + a paid Moderato call whose limit dropped by exactly the price); receipts are the agent thesis.

### D-086 — Tempo Indexer API: session-only MPP, testnet queries paid on Moderato, testnet sessions refused (finding, S3.5, 2026-09-29)

`GET api.tempo.xyz/v1/indexer/query` answers every anonymous request with 402 — `session` only, 100 base (pathUSD) per
request, suggested deposit 10,000, escrow `0x4d50…`, recipient `0xfF87…20f0`, **charged on the network queried**
(`chainId=42431` → Moderato; this corrects 16 §8, which saw testnet queries charged on mainnet). A Moderato session is
**rejected by the server** ("Payment verification failed" / `PAYMENT_REJECTED`) for our payer and for the official
`mppx` 0.11.0 CLI alike, although the signed channel-open transaction is valid (broadcast by hand it lands, tx in
`acceptance/S3.5.md`). **Decision:** the indexer client supports three auths — API key (`TEMPO_INDEXER_API_KEY`, the
owner creates it in the Tempo console: owner action), MPP session (live on mainnet after Q-020; testnet once Tempo
accepts the session), and a **self-hosted tidx** base URL (`TIDX_URL`) — and is proven against a real tidx following
Moderato (S3.5.3). Q-012's default (own follower + the Indexer API for analytics) stands.

**Why:** measured; the client must be real now without spending mainnet funds or creating accounts for the owner.

### D-087 — indexer sources are generated; the recount compares against the chain until `idx_events` exists (decision, S3.5, 2026-09-29)

`scripts/codegen/clients.mjs` also writes `packages/clients/src/indexer.ts` (`indexerSources`): per chain, every
deployed contract with its deploy block and each event's **full** signature (`indexed` + names — what `signature=`
needs to expose decoded columns) and topic0; `codegen:check` in CI keeps it reproducible. The hourly recount (ops actor
`indexer-recount`, `indexer_recounts` table) counts each event in the indexer (raw `logs` by address + selector) and
in our own record over one closed range; "our own record" is pluggable — the chain's `eth_getLogs` now, an `idx_events`
counter when S3's follower creates that table (its schema is S3's). A backfilling self-hosted tidx reports contracts it
does not yet cover instead of comparing them. **Finding:** a tidx following Moderato over the public RPC is throttled
(HTTP 429; batch requests > ~50 receipts are "request too large") to ≈4 blocks/s of backfill — a hosted tidx needs a
provider RPC or a key on the public one.

**Why:** C.4.3 asks for the recount against our index; the chain is the stricter reference until the index exists.


### D-110 — the shared product seam's shape: `EngineSeam` library + `PayoutCheck`/`Payouts` (decision, S7, 2026-09-29)

Refines A.4 "Shared" where it left the shape open. (1) `EngineSeam` is an internal library taking `(engine, lens,
collateral)` explicitly, so it inlines into each product and the engine sees the product as `msg.sender`.
(2) `placeMeasured` is for non-resting taker orders only and asserts, besides A.4's buy/sell rows, `restedLots == 0`
and that the product's engine credit and locked cash are unchanged; `redeemPartialMeasured` asserts `Δwallet ==
payout`, `Δfree == lots`, credit unchanged. Makers (S8) need their own `PostOnly` variant. (3) `Payouts.sol` holds two
pieces: `library PayoutCheck` (`receivable`, `payChecked` → `ReceivePolicyBlocked(address)`) for payouts the receiver
triggers on themself, and `abstract contract Payouts` (`_payOrOwe`, `owedOf`, `totalOwedPayouts`, `claimOwed()` paying
`msg.sender`) for payouts someone else triggers; a product that never owes (the vault) inherits only the library, so
its ABI gains no dead `claimOwed`. A TIP-403 token policy that reverts the transfer is caught by OZ `trySafeTransfer`.

**Why:** the vault needs the refusal form (P12 on its own withdrawals) and S10/S12b need the owe form; one file, no
unused surface.

### D-111 — EventVault seam details (decision, S7, 2026-09-29)

Amends A.4.1 where the port needed a choice: `VenueGateway.MarketRef` also carries `status` (read in the same
`lens.marketRef` call, so `_placeIoc` and `_isSettled` need no second read); `_resolve` turns any lens revert, or a
zero `lotBase`, into Masayume's `UnknownMarket(bytes32)`; the constructor also pins `lens.engine() == engine`
(`WrongLens`); `expireNs / 1e9` is clamped to `lockAt` (an expiry already past refuses in the engine,
`OrderAlreadyExpired`); `ReentrancyGuard` stays OZ's storage guard, as in Masayume (as-is, D-003). `Caps.market` is
appended as the struct's last field (no packing change for the four Masayume fields) and is checked on buys **and**
sells before the market is resolved (Agari `require_market` runs on every `actor_place_for`). D-062: `_bookSale` releases
the opening grant's count when a side reaches zero (the owner's own `place` sale included); `crankSettle` releases a
tag left on an emptied side at a zero payout instead of reverting, and still refuses `NothingToSettle` when there is
neither a position nor a tag.

**Why:** each keeps Masayume's behaviour and error names while closing the gaps the engine's shape opens.

### D-112 — vault withdrawals refuse on a blocking receive policy; they never owe (decision, S7, 2026-09-29)

`withdraw` and `withdrawPrivate` are the owner's own calls paying `msg.sender`, so P12 is the engine's own-call rule:
pre-check `validateReceivePolicy(pathUSD, vault, owner)` and revert `ReceivePolicyBlocked(owner)`, leaving the balance
in the Trading Balance (a TIP-20 transfer would otherwise "succeed" into the ReceivePolicyGuard, F-S2-09). Nothing the
vault does pays anyone else — `crankSettle` credits `available` — so the vault needs no owe path.

**Why:** the owner can clear their own policy and retry; holding the money as owed would add a second bucket for no gain.

### D-113 — how Masayume's vault suites run on the real engine (finding + decision, S7, 2026-09-29)

`BookSeeder` rests real PostOnly maker quotes where `MockVenue` had knobs: before each placement it rests Masayume's
book (YES at 0.60 / NO at 0.40) on the side the next order takes, cancelling the maker's other side first (a real book
cannot be crossed, so the mock's "YES 0.60 and NO 0.40 at once" becomes just-in-time quotes; every expected number is
unchanged). The golden caps vectors are copied byte-identical. The two knobs with no engine counterpart keep their
tests with the engine's behaviour asserted: refund-as-credit (row #2: the engine pulls the exact cost, the vault's
credit stays 0, `sweep` returns 0) and taker fees (row #10: no fee field, Q-005/T10). `ImmediateOrCancelNoFill` is the
engine's own error of the same name. The Somnia fork test is a Moderato fork replaying the S2.12 Window through a fresh
vault. The only mock is `LyingEngine`, a fault injector that trades honestly until told to lie (7 lies).

**Why:** A.6/D-018 — the suites prove the seam against the real engine; the mock proves only the assert.

### D-114 — the vault is live on Moderato; tap-trading waits for S4 only for sponsorship and the browser key (finding, S7, 2026-09-29)

`EventVault` `0x5E38dc8b7402FFB608134872a64663e5D75235b8` (deployer-vault, Sourcify exact match) against the S2 engine;
area `vault` with `relay/policies/vault.ts` (Masayume's list unchanged; Q-021 open). The live drive
(`scripts/drive/vault-live.ts`, acceptance/S7.md) runs the tap flow on a Window the S3 roller listed with throwaway
accounts; the session key pays its own fee until S4's relay sponsors `placeFor`. The WebCrypto P-256 session key,
the web features and the settler's `crankSettle` actor are S7's off-chain half (after S4).

**Why:** the contract half of S7 is complete and proven live; what remains is sequenced, not cut.


### D-115 — maker vault seam details (decision, S8, 2026-09-29)

Amends A.4.2 where the port needed a choice. `EngineSeam` gains the maker's measured calls (D-110 left them to S8):
`restMeasured` (PostOnly buy only, `useCredit = false`, `withdrawProceeds = false`; `restedLots == lots`, nothing
filled, `Δwallet == transferredIn == lots·ownTicks·cu`; the product's credit may only grow — the cross walk may evict
its own expired quotes into it, E-35), `collectCreditMeasured` (`Δwallet == amount`, credit 0 after),
`mergeMeasured` (`mergeSet(m, lots, true)` from zero credit; `Δwallet == withdrawn == lots·1000·cu`, one lot off each
free side) and `redeemAllMeasured` (one full `redeem`; `Δwallet == total`, the position empty after). The vault books
**every** credit withdrawal as the Window's `escrowBack` through `_collectBooked`, whatever put it there (its own
cancel, its own eviction during a later `quote`, a third party's `sweepExpired`, a taker's eviction), because the
maker's engine credit can only come from its own escrow. `MakerGateway.MarketRef` carries `status` (as D-111);
`MAX_FILLS = 1` (PostOnly never fills; the engine wants ≥ 1), `MAX_EVICTIONS = 4`, `cancelAll(m, 16, false)` (the
engine's per-holder cap is 16). `quote`'s `TooLate`/`BadExpiry` and `pull`'s "anyone after" use `lockAt`; the
withdrawal gate `unsettledExpired` uses `expiry` (T08). `withdraw` pre-checks the receive policy and refuses
(`ReceivePolicyBlocked`, as D-112); the vault never owes. No inflation guard: value is `liquid` + booked deployment.

**Why:** each assert catches a venue report that disagrees with the balances it moved; keeping every credit on one
booking path is what makes `wallet == liquid (+ donations)` an equality.

### D-116 — how Masayume's maker suites run on the real engine (finding + decision, S8, 2026-09-29)

`MakerTestBase` (on `EngineFixture` + `BookSeeder`) replaces `MockMakerVenue`; takers are real IOC orders against the
vault's resting quotes. Masayume's two venue-refund tests keep their names and assert the engine's behaviour:
`test_pull_collectsARefundThatLandsAsPoolCredit` — the cancel's escrow lands as engine credit and is collected in the
same call; `test_quote_booksTheVenuesLazyRefundOfAnExpiredQuote` — the engine never refunds inside a placement (E-33,
D-017), so the next quote's escrow is its own measured delta and a pull returns both pairs to the cent. The Shannon
fork test is a Moderato fork replaying the S2.12 BTC Window. `LyingEngine` (still the only mock) gains the maker
surface (PostOnly rest, `cancelAll`, `mergeSet`, `redeem`, `marketsOf`) and three lies (`CreditShort`, `MergeShort`,
`RedeemAllShort`).

**Why:** A.6/D-018 — suites prove the seam on the real engine; the mock proves only the asserts.

### D-117 — launch params unchanged; the maker key is `deployer-maker` until S4's earn-quoter (decision, S8, 2026-09-29)

`MarketMakerVault` `0xa31F6B5a585fF331cC13Fd1c6FAa282024Ca32a6` is deployed with Masayume's launch params (exposure
60 %, min spread 0.02, prices 0.05–0.95, 20 a side, 200 per Window, 8 Windows, 45 s before lock). Admin and maker are
`deployer-maker`; when S4's earn-quoter actor runs on `runActor`, the admin calls `setMaker(earn-quoter)` (key already
provisioned at `~/.config/cwf/testnet/earn-quoter.json`) — no redeploy.

**Why:** the vault must quote live before its off-chain actor exists; `setMaker` is the designed hand-over.

### D-118 — maker relay policy: sponsor exits and keeper calls, never intake, quoting or admin (decision, S8, 2026-09-29)

`relay/policies/maker.ts`: sponsor `withdraw`, `pull`, `merge`, `settle` (each moves only the vault's own money, or
pays `msg.sender` P12-checked); never `supply` (capital intake pays its own gas, D-020/D-029), `quote` (the quoter key
pays from the ops budget), `setParams`/`setMaker`/`setPaused`/`setAdmin`. Geofenced entry: `supply` (Q-008). Masayume
had no sponsor list for its maker vault; this follows the Trading Balance's rule (D-114's area `vault`).

**Why:** the keeper calls a supplier's "Settling 2 of 4" needs must be free; nothing sponsored can move value in.

### D-119 — the maker vault is live on Moderato and passed the contract gate; the earn-quoter and `/earn` wait for S4 (finding, S8, 2026-09-29)

`MarketMakerVault` `0xa31F6B5a585fF331cC13Fd1c6FAa282024Ca32a6` (deployer-maker, Sourcify exact match), area `maker`
with `relay/policies/maker.ts` (D-118). The live drive (`scripts/drive/maker-live.ts`, acceptance/S8.md) quoted a
Window the S3 roller listed inside the house book, showed the vault's depth at the top of both sides through
`lens.levelsRaw`, was filled by a wallet-mode taker and an EventVault taker, merged by a stranger, pulled after lock by
a stranger, and settled by a stranger after S3 voided the Window (realized +0.118 booked, the engine position zero,
`wallet == liquid`). Quoting was signed by `deployer-maker` (D-117). The ops earn-quoter actor on `runActor`, the
settler's `vault.settle` crank for every closed Window, and the `/earn` supplier UI are S8's off-chain half (after S4).

**Why:** the contract half of S8 is complete and proven live; what remains is sequenced, not cut.
### D-135 — the engine relay policy is registered: trading and exits sponsored, capital intake never, EventsEngine the only target (decision, S4.1, 2026-09-29)

`relay/policies/engine.ts` joins `POLICIES`. **Sponsored:** `placeOrder` (the markets entry: geofenced, Q-008),
`cancelOrders`, `reduceOrder`, `cancelAll`, `mergeSet`, `withdrawCredit`, `redeem`, `redeemPartial`, `setCrankOptOut`,
with `pathUSD.approve(engine, exact)` riding along (never max). **Never** (refuses the whole transaction): `mintSet` —
pure capital intake into a complete set, D-020/D-029 — and the admin/roller surface. **Not sponsored** (the sender
pays): the permissionless keeper calls (`recordPrint`, `settle`, `voidExpired`, `sweepExpired`, `redeemFor`, …), which
ops signs itself. **Targets:** only `EventsEngine`, read from the deployment fragments — the area's generated relay
targets also list the lens, verifiers and linked libraries, and as targets they would have passed the approve-spender
check (an approval to a library sponsored). Gas cap 3M (+250k for a new account, +D-136 for the wallet key). Live:
`scripts/drive/relay-engine.ts` (acceptance/S4.md).

**Why:** every engine payout goes to `msg.sender` (AD-5), so sponsoring trades and exits moves nobody else's money;
capital intake stays the root's own cost; the narrowed target list closes an approval hole.

### D-136 — the relay sponsors publishing exactly one kind of key: the wallet-mode key, on its first tap (decision, S4.1–S4.2, 2026-09-29)

The accounts SDK publishes the sign-in ceremony's `accessKey.authorize` as a tx-level `key_authorization` on the key's
next transaction (the first tap). X20 measured that tap at **6,255,108 gas** (fill estimate 7.07M) against 192,324 for
a later tap — over the engine cap, so the relay refused it and the arm would have cost the user a prompt and a fee.
`RelayPolicy.keyAuthorization` (`relay/key-auth.ts`) now names which authorizations an area pays to publish: the
engine accepts only the D-047 shape — no admin, expiry ≤ 24 h (+5 min skew), limits only on pathUSD, periodic, ≤ $25
(Q-031), scopes ⊆ {engine `placeOrder`/`cancelOrders`/`redeem`/`withdrawCredit`, `pathUSD.approve` bound to the
engine} — and adds 5M gas for it. Any other tx-level key authorization (unrestricted, admin, longer, wider, another
area) refuses the transaction (`key-auth`); both request shapes are read (viem's and the node's RPC shape). Cost of an
arm at Moderato's 1.69 gwei-equivalent: ≈ $0.011.

**Why:** D-046's "one biometric, then zero per tap" needs the arm itself sponsored; bounding the rule to the exact
wallet-key shape keeps the relay from paying to create arbitrary keys.

### D-137 — writes are never retried by the transport; an ambiguous send is "unknown" (finding + decision, S4.1–S4.2, 2026-09-29)

Measured on Moderato: (1) viem 2.56's `withRelay` bakes three retries into its proxy and the RPC `http` adds its own,
so one relay refusal (a revoked key, an engine revert inside the fill) became ~50 requests and outlived the tap's 25 s
expiring window, surfacing as "transaction expired"; (2) the gateway sometimes answers `eth_sendRawTransactionSync`
with a Cloudflare 502 page, and viem's resend of the same bytes ~60 s later is refused (`valid_before … too close to
current time`) — the node also enforces a *minimum* distance to `validBefore`; (3) a JSON-RPC batch of `eth_getLogs`
answers 502 or an unreadable body. So: `tempoTransport` routes like `withRelay` through our own `relayProxy` with
retries off (relay 0, raw sends 0, reads 1); the lanes treat a timeout or a transport failure on the raw send as
**unknown** (journaled, decided by the expiring window, never re-sent — AD-3), and a fill failure as a refusal with the
node's own words (`details`: `KeyAlreadyRevoked`, `SpendingLimitExceeded`, `CallNotAllowed` now diagnose by name);
logs read through an unbatched client (`getLogClient`).

**Why:** a tap must fail fast and honestly; a blind resend of a money write is exactly what the journal exists to
prevent.

### D-138 — spike X20: wallet mode works as D-047 describes; the daily limit counts approval *increases* (finding, S4.2, 2026-09-29)

Measured on Moderato (acceptance/S4.md): a passkey-shaped root signs one TIP-1011 authorization for a non-extractable
WebCrypto P-256 key (scopes: engine `placeOrder`/`cancelOrders`/`redeem`/`withdrawCredit` + `pathUSD.approve` bound to
the engine; $25 pathUSD per 86,400 s; 24 h). Ten `[approve exact, placeOrder IOC]` taps sign with the key and no root
prompt, all relay-sponsored; the first publishes the authorization (6.49M gas, D-136), later taps cost 188,927 gas and
2.3–4.0 s tap-to-receipt. The eleventh is refused `SpendingLimitExceeded` before signing; a transfer, an approve to
another spender and `mintSet` are refused `CallNotAllowed`; after the root's sponsored `revokeKey`, the key is refused
`KeyAlreadyRevoked`. **The limit counts the increase of the allowance, not the approve amount:** an IOC pulls less
than its protective escrow, the leftover allowance stays, and the next exact approve counts only the difference — so
the limit bounds what the key can ever move, and the tap after a cheap fill costs the limit less. The order lane keeps
approving the exact escrow (never max); the `/settings/account` pipeline reads the remaining limit live.

**Why:** X20 is D-047's proof; the limit semantics decide what "$25/day" means on the trust surface ("up to $25 of
new spending authority per day").

### D-139 — spike X21: rapid taps are parallel expiring-nonce transactions; the only limit met was the public RPC's rate (finding, S4.3, 2026-09-29)

Five orders from one wallet-mode key, started 300 ms apart, each its own Tempo transaction with `nonceKey =
maxUint256`, `nonce = 0` and `validBefore` = chain-clock now + 25 s set explicitly by `tx/nonce.ts`, sent through
the production order lane concurrently (the session queues only protocol nonces): all five confirmed, four in one
block (37,416,181) in run 1, within 4.4 s in run 3 — no nonce contention, no replacement, each decided by its own
window. The one failure mode was Moderato's public RPC rate limit (`rate limited, try again in 118ms`) on the
concurrent fills; the transport retries a rate-limited **non-send** request after the hinted delay (≤ 3), never a raw
send (D-137). A production relay on its own RPC endpoint moves this limit off the users' IPs.

**Why:** X21 is the rapid-tap proof L-08/§2.4 assume; expiring nonces are what make "tap, tap, tap" safe without a
client-side queue.

### D-130 — Tempo RPC over HTTP: no JSON-RPC batching, larger Multicall3 chunks (finding + decision, S3 fix, 2026-09-29)

**Finding** (measured on `rpc.moderato.tempo.xyz`, 2026-09-29, curl and `scripts/drive/rpc-load.ts`): the public RPC
budgets a JSON-RPC batch by method weight — 8 `eth_call`s pass, 9 answer HTTP 413 `{"id":null,"error":{"code":-32600,
"message":"request too large"}}`; 24 `eth_blockNumber`s pass, 25 do not; 12 `eth_getBlockByNumber`s pass, 24 do not —
and a rate-limited batch answers HTTP 429 with one `-32005` object. A batch refused whole comes back as an object where
viem's batch scheduler expects an array, so viem throws `Cannot read properties of undefined (reading 'error')` for
every request in it. viem's scheduler is process-wide per URL: every ops actor's reads and sends inside the 10 ms wait
shared one batch (default `batchSize` 1,000), and Multicall3's default 1,024-byte chunks turned one `fetchMarkets` of
~450 Windows into ~16 `eth_call`s. Once the venue listed its 66 Series the batches crossed the budget at every
boundary: from 08:45Z the roller's opens, the relay's prints and the maker's quotes failed together (roller 15 opened /
1,981 failed since 10:43Z; relay 492 failed, 80 missed) and 93 % of Windows voided.
**Decision:** every Tempo HTTP transport goes through `tempoHttp` (`packages/markets/src/rpc-http.ts`): one request per
HTTP request (keep-alive), `retryCount` 5 with viem's exponential backoff (429 / -32005 / 5xx are retried per request),
and Multicall3 chunks of 8,192 bytes. Applied to the ops client, the web read client and `tempoTransport` (batching
there only on explicit request, capped at 8). Live probe, 10 ops clients × 3 concurrent boundary passes (list every
Series + read every tracked Window): before 0/30 passes, after 30/30 (6,450 Window reads).

**Why:** the binding constraint is the RPC's request shape, not gas (F-S3-02): a boundary's prints need ≈ 41 sends
and ≈ 15M gas, far inside the 30M block budget.

### D-131 — a failed read or send is never mistaken for a finished Window (decision, S3 fix, 2026-09-29)

(1) `fetchMarkets` returns null only when the lens reverts `UnknownMarket`; a chunk that failed on the RPC throws.
Before, `allowFailure: true` turned a rate-limited chunk into nulls and the relay's tracker treated a null as "done",
advancing its low-water mark past Windows it had never read. (2) The price relay counts only the chain's answers toward
its five-attempt give-up (an engine custom error, or a mined revert); a transport failure (413/429/5xx, timeout) retries
every pass until the slot's admission deadline. Agari's relay gave up after 5 failed Solana transactions, which were
the chain's answers; on Tempo a transport failure is not.

**Why:** a print slot has up to 900 s of admission; five transport failures took ≈ 15 s and voided the Window.

### D-132 — which Series roll when is unchanged: no expected voids in the soak (finding, S3 fix, 2026-09-29)

Compared with Agari's planners (`agari-wt/w1` @ `03b30abbbfe7ddc3cac4927c7c573e52f74d2d49`, `services/ops/src/actors/
window-roller/{plan,plan-gap,plan-token,versions}.ts`) and C.5.2: Regular Windows list only inside the agreed session
(prelisting the next session's first Window at the close), the Gap from Wednesday 16:00 ET, the 24/7 lanes back to back;
a candidate whose opening print can no longer be admitted (`openPrintsAdmissible`, 45 s relay margin) is skipped, and a
24/7 stock lane without a RedStone `<T>---24_7` feed (PLTR, AMD) is never listed (D-091). The soak's index agrees: no
Regular, Gap, PLTR-24 or AMD-24 Window was opened out of session or without a source, and every voided Window had a
signed source available (RedStone gateway history holds all five signers at the missed boundaries, e.g. `TSLA---24_7`
at 08:00:00Z). The seed maker covers every rolled Series (`MM_SYMBOLS` unset) and quotes a Window once its open print
is in: across the soak 320 of 337 printed Windows were quoted and none without an open print (the rest failed on the
same RPC).
So the roller needs no skip rule beyond Agari's; the voids were throughput on the RPC (D-130, D-131).

### D-134 — one paced RPC budget per URL for all ops actors, the print path first (finding + decision, S3 fix, 2026-09-29)

**Finding** (measured 2026-09-29 from one IP, singles at a fixed rate for 8 s): the public RPC sustains ≈ 13
`eth_call`/s or ≈ 36 `eth_blockNumber`/s — the same weights as its batch budget (D-130) — and answers HTTP 429 `-32005
"rate limited, try again in N ms"` beyond. Every ops actor shares the container's IP. After D-130 alone the batches
stopped failing, but boundary bursts still hit the limit (`Request exceeds defined limit` after viem's 5 retries), and
the seed maker's re-quotes (≈ 0.5 sends/s across 55 Windows) alone use most of it.
**Decision:** ops clients of one URL share a token bucket (`packages/markets/src/rpc-budget.ts`) of
`TEMPO_RPC_UNITS_PER_SEC` (default 30; 0 = unpaced, for a private node) with the measured method weights. Queue order:
tier 0 the print path (price-relay, roller, settler), tier 1 the house (seed maker, house taker) and the indexer,
tier 2 watchers (halt-watch, funds-watch); inside a tier the send path, then reads, then log scans. A 429 pauses the
bucket for the time the RPC names and cuts the rate × 0.75 (once a second, floor 3 units/s); after 5 quiet seconds it
climbs back 0.5 units/s per second to the ceiling — the IP's limit is shared with whatever else runs on the box, so
the ceiling alone is not enough (first deploy: 21 units/s of demand still drew 291 429s in 4 min). `/health` shows `rpc` (units and requests per method over the last minute, queue,
max wait, 429s). Live probe, 10 clients × 3 boundary passes through one budget: 30/30, no 429 retries exhausted.

**Why:** the prints decide whether a Window settles; quotes can wait a few seconds at a boundary, prints cannot miss.

### D-133 — the S3 soak clock restarts after the fix (decision, S3 fix, 2026-09-29)

The gate is "24 h unattended"; the first soak ran with a defect that voided 93 % of Windows from 08:45Z, so it cannot
count. The clock restarts at the fix's deploy (time in `acceptance/S3.md` and the stage Handoff) and must again span a
US session and a crypto overnight.

### D-140 — the wallet key is armed by one explicit `wallet_authorizeAccessKey`, offered in the ceremony and on the ticket (decision, S4 UI, 2026-09-29)

The accounts SDK calls the connector's `accessKey.authorize` hook on every connect and, when a default is set, before
any transaction with no matching key — either would put a key prompt where the user did not ask for one (a second
biometric inside sign-up, or one on a tap). So the hook answers only while an arm runs (`requestArm`), and the arm is
one explicit `wallet_authorizeAccessKey` on the passkey provider with the terms built by `walletKeyAuthorization()`
(the relay's exact D-136 shape — a web test checks the RPC params against `walletKeyRule`). It is offered in the
ceremony's arm slot (D-046) after funding, and from the ticket's "tap-trading" chip for accounts that skipped it; an
injected wallet is never offered it (X8). The SDK keeps the key (non-extractable WebCrypto P-256) and signs the calls
it covers with no prompt (`AccessKeyTransaction` in its `eth_fillTransaction`/`eth_sendTransactionSync` path),
publishing the authorization with the first call (sponsored, D-136). The device keeps only the terms it armed
(`cwf.walletKey.v1.<chain>.<account>`), so the ticket can say "no prompt" and `/settings/account` can list the key as
"armed on this device" until the chain has it; after that the chain is the only source and the row carries the
limit's meaning ("counts new spending approvals, not fills", D-138).

**Why:** D-046's one biometric to a funded account and D-047's zero prompts per tap, without ever surprising the user
with a key prompt, and one builder so the UI and the relay cannot drift.

### D-141 — taps sign with our own wallet key through our lane, not the accounts SDK's access-key path (finding + decision, S4 UI gate, 2026-09-29)

**Finding** (virtual-authenticator gate on Moderato, `web/e2e/first-call.ts`): with the key in the SDK's store (D-140's
first shape), 8 of 9 taps signed with no prompt but one asked for the passkey. The SDK's `eth_sendTransactionSync` /
`eth_fillTransaction` try the access key and on ANY failure fall back to the root (`catch {}` in
`Provider.sendTransactionSync_`, accounts 0.18.4) — a surprise biometric, and after an ambiguous send a second
transaction for the same call, which D-137 (writes are never retried) exists to prevent.
**Decision:** the browser makes its own non-extractable WebCrypto P-256 key (`@cwf/markets` `newWalletKey`, the
`sessions/session-key.ts` path X20/X21 proved), the passkey authorises it once through `wallet_authorizeAccessKey` with
the key's address (the SDK keeps no key material), the pair lives in IndexedDB as a CryptoKey handle, and a submitter
session with authority `access-key` (`walletKeySession`) signs calls, cash-outs and collects through `tx/send.ts`,
publishing the authorization with its first send (sponsored, D-136). Revoked or expired keys (read from the
AccountKeychain) are forgotten; root actions (revoking keys) stay on the passkey session. D-140's arm step is unchanged
for the user.

**Why:** "zero prompts per tap" must hold when the network hiccups too, and a money write is sent once or not at all.

### D-142 — the order lane's pre-send reads run together (decision, S4 UI, 2026-09-29)

The status gate, the account reads (engine venue, the wallet's position, its pathUSD balance) start at once; the fresh
quote joins them as soon as the Window is known. Measured in the gate: 0.5–1.5 s from tap to send (was up to 2.1 s with
the reads in a row) on a heavily loaded machine.

**Why:** the tap's latency budget (§2.4); nothing about the checks changed, only their order.

### D-143 — the tap target is missed on this testnet setup; measured and recorded, not hidden (finding, S4 UI gate, 2026-09-29)

§2.4 asks for the Call card ≤ 1 s p50. The gate measured tap → Call card p50 ≈ 6–10 s (pre-send 0.5–1.5 s; send → receipt
4–11 s; the first tap ≈ 10–12 s because it publishes the key, ~6.8M gas) on a machine at load average 50–190 with the
relay running locally and every read and send going to Moderato's public RPC (per-IP rate limit, D-134). X20's scripted
taps measured 2.3–4.0 s on the same chain. The target is re-measured on the deployed testnet (relay on Coolify) and on
the owner's phone (Handoff); the pressed state is ≤ 205 ms everywhere (§2.4's first half passes).

**Why:** a flow target is a gate, and a missed gate is recorded with its numbers, never rounded off.

### D-150 — the Call card is confirmed-pending once the key has signed; the tap's reads and the relay's checks each take one round (finding + decision, S4-fix, 2026-09-30)

**Finding** (deployed testnet, `web/e2e/tap-latency.ts`: CDP virtual authenticator, fresh passkey + arm, 12 taps on
Crypto 5m, the page's own marks and the browser's network timings; p50): press → handler 3 ms · pre-send 521 ms (the
status gate, then the book — two WebSocket round trips) · relay fill 451 ms (policy `validate`: a new-sender RPC read,
the ledger totals in two rounds, the fee payer's balance read inline every 30 s, plus the node's fill) · the wallet
key's P-256 signature 5 ms · **no co-sign** (accounts 0.18.4 signs the fee payer into the fill, so `validate` runs once,
not twice) · `eth_sendRawTransactionSync` 696 ms (inclusion ~0.5 s + the gateway) · receipt → card 8 ms: **press → Call
card p50 1,836 ms** (max 2,790; 0 prompts), the card waiting for the receipt. An earlier run the same morning agreed
(pre-send 478, fill 410, send 821 ms). Nothing refetches before the card (the invalidations run after it renders), and
the web relay is not on the ops RPC budget (D-134 paces ops clients only), so nothing queues the send.
**Decision:** (1) the send runs viem's own `sendTransactionSync` steps in the open for a local signer
(`prepareTransactionRequest` → sign → envelope → `sendRawTransactionSync`), so the final hash is known before the
receipt — still one send, never retried (D-137); (2) the ticket shows the Call card **confirmed-pending** (D43) at that
moment: the confirmed quote's figures ("You stake up to", "Confirming on Tempo…"), the receipt swaps in what the engine
booked, and a revert, refusal, `unknown` or nothing-filled rolls back to the ticket with the chain's answer; nothing
pins to "Your calls" before the receipt; (3) the book read starts with the status gate (Series facts are cached), one
round; (4) the relay skips the new-sender read for a sender already seen with a nonce, reads the four ledger totals in
one round, and keeps the fee payer's balance stale-while-revalidate. Local build and local relay after: press → card
p50 836 ms (pre-send 253 ms), press → confirmed p50 1.64 s. The deployed number is the integrator's re-run of the script.

**Why:** §2.4's "Call card ≤ 1 s p50" can only be met by showing the call when it is irrevocably sent — Tempo's ~0.5 s
inclusion plus a sync round trip is already most of a second — and D43 already names that state; the card never claims
a fill it has not seen.

### D-151 — a signed-in user without a server session follows their own events on the chain; the passkey session lives 30 days (finding + decision, S4-fix, 2026-09-30)

**Finding** (deployed testnet, virtual authenticator): sign-up and login set `cwf_passkey` (`Path=/; SameSite=Lax;
HttpOnly; Secure`) and `/api/stream/ticket` answers 200 — cookie name, path, domain and Coolify's proxy are fine. It
answers 401 to users the page still shows signed in without a server session: (1) the passkey session lived 24 h while
wagmi restores the connection with no ceremony indefinitely, so every returning user after a day (and anyone whose
session was lost: Redis, cleared cookies); (2) every Tempo Wallet, injected or WalletConnect user — no route issues the
social session (`cwf_social`, S13's). The hub then dropped `user:<address>` silently and wallet reads fell back to polls.
F-S4-17's local 401 on a fresh sign-up did not reproduce on this build (localhost: 200).
**Decision:** the session lives 30 days (it backs only the faucet claim and the ticket; authority stays on chain); the
stream reports whether it carries the per-user topic, and when it does not (or no stream is configured) the page
watches the wallet's own engine events on the chain — D-049's "chain WebSocket logs for the user's own events": one
`eth_subscribe` log filter per event ops routes to `user:<address>` (`Fill` taker/maker, `OrderExecuted`,
`OrderRemoved`, `OrderReduced`, `CompleteSet`, `CreditWithdrawn`, `Redeemed` — each with the wallet as an indexed
topic), mapped to exactly the invalidations the stream frames make. No prompt, no weaker ticket.

**Why:** "signed in" in the UI must mean live updates whatever the server session's state; minting a ticket without a
proof would have made it meaningless, and a sign-in prompt to repair a stream is not acceptable UX.

### D-152 — third-party wallet code and the wallet runtime load on use; a Window is read once per render pass (finding + decision, S4-fix, 2026-09-30)

**Finding** (Lighthouse CI `lighthouse.yml` on the deployed testnet, quiet GitHub host, median of 3): `/` CLS 0.085;
`/markets` TBT 2,360 ms; `/markets/[id]` TBT 5,042 ms; `/portfolio` TBT 580 ms; LCP within 2.5 s on every route.
Causes: (1) wagmi sets up the Tempo Wallet connector on every app page and accounts 0.18.4's dialog adapter mounts its
`wallet.tempo.xyz` iframe at setup — with Stripe ×3, a session recorder and surveys, ~1 MB of third-party script
(`resource-summary` script 2.5 MB on `/markets`); (2) the wallet runtime (accounts SDK + zod, 784 KB) evaluated on idle
for every visitor; (3) each lane card re-read its own Window right after the lane list read all ~69 of them — a second
230 KB multicall whose ABI decode was the longest task left (0.35–0.5 s at 4× CPU); (4) the landing heading wraps in
3 lines in Sora's metric fallback and 4 in Sora at 390 px, so the font swap pushed the pillars down.
**Decision:** Tempo Wallet and WalletConnect are `lazyConnector`s (built on first use or when last used — wagmi's
reconnect); the runtime mounts when a connection is stored or on the first interaction (a "Sign in" tapped earlier is
queued, as before); display reads share a lens answer for 1 s and join a read in flight (`readWindowsShared`; the order
lane's status gate still reads at submit); the heading reserves Sora's lines (`hero-lines`). Same host, 4× CPU,
long-task blocking over 12 s (`e2e/long-tasks.ts`, deployed before → local build after): `/markets` 3,529 → 679 ms,
`/markets/[id]` 2,795 → 230, `/portfolio` 1,246 → 72, `/` 276 → 80. Lab numbers on this workstation (load 25–125) are
not the gate; the gate is `lighthouse.yml` on the next deploy.

**Why:** a visitor who only reads should not pay for a wallet they have not opened; the lens stays the source for
every figure, read once.

### D-153 — "Returned" is proven on real voided positions through the verdict read; the card on a user's own call waits for a void (finding, S4-fix, 2026-09-30)

No void can be produced honestly on demand: `voidExpired` needs a primary print missed past its deadline (or a
cross-check divergence), and the only way to cause one now is to stop the live print path (the S3 soak) — not done.
Real voids exist: 4 Windows that real orders crossed voided on 2026-09-29 (`void_reason` 1, missing print, during the
S3 RPC defect, D-130/D-131). `scripts/drive/void-returned.ts` runs the production `getPinnedVerdict` — the read the
pinned card and ClaimWinnings render — for all 9 holders: verdict `void` for every one; 8 `paid` (7 by the settler's
`redeemFor`, `paidBy: auto`; 1 by the holder) with the engine's `Redeemed` payout (0.5 per contract each side), 1
`stamped` (unredeemed, collectable). The UI card ("Returned" + reason) on a passkey user's own call is observed the next
time a Window with such a call voids: the settler voids it within a minute of the missed deadline, `first-call.ts`
already counts "Returned" in "Your calls", and the index's `state=voided` query lists every one.

**Why:** a void is the chain's answer to a missed print; staging one would be a fake.

### D-155 — the settler cranks the vault's owners as soon as a Window is terminal; no claim grace (decision, S7 off-chain, 2026-09-30)

The engine's `redeemFor` refuses the vault (its crank opt-out, T09/D-015), so `EventVault.crankSettle(owner, m)` is the
only way a Trading Balance owner is paid. The settler's vault worklist (`services/ops/src/actors/settler/vault-crank.ts`)
takes (Window, owner) pairs the index saw trade through the vault on a resolved or voided Window with no `Settled` yet,
confirms on chain which still hold a position or a grant tag (`positionOf` / `positionGrantOf`, one multicall), and sends
each crank from the settler key inside the same send budget as the engine work, after it. Unlike `redeemFor` there is
no 300 s grace: the owner has no self-claim the grace would protect, and "verdict → paid" needs no prompt (§2.4).
`NothingToSettle` / `MarketNotSettled` are benign (ops/send now names vault errors too).

**Why:** the vault owner would otherwise wait for nothing; the payout lands in the Trading Balance within a pass.

### D-156 — a passkey write that does not ask for a fee payer says `feePayer: false` (finding + decision, S7 gate, 2026-09-30)

**Finding (F-S7-10):** the passkey connector is configured with our relay as its fee payer (`webAuthn({ feePayer })`), and
accounts 0.18.4 then marks every transaction for sponsorship unless the request carries `feePayer: false`
(`Provider.getWalletClient`). A never-sponsored root write (capital intake: `[approve, depositAndGrant]`, D-020) was
refused by the relay at `eth_signRawTransaction` and could not be sent at all. **Decision:** the one send module says
so: `sendBatch` adds `feePayer: false` to an unsponsored send from a wallet-held (`json-rpc`) signer — the passkey
connector, a wallet app (`tx/send.ts`, one line; the write boundary keeps every send there); sponsored writes carry
`feePayer: true` as before; local accounts (keys, ops, drives) are untouched.

**Why:** intake stays self-paid (the relay's `never` list is unchanged) and the user can still make it.

### D-157 — the relay's async sender rule reads the chain through the relay's own client (decision, S7, 2026-09-30)

C.3.3's async sender rule is implemented: `EngineConfig.reader` (the relay handler's public client) is passed to every
`asyncSender`; the vault's `placeFor` is sponsored only when `grantOf(id).actor == from && isGrantLive(id)`; without a
reader the rule refuses (fails closed); a live answer is remembered 15 s per (vault, grant, sender), a refusal never.
**Finding (F-S7-09):** on Moderato the node's fill estimate already reverts a foreign `placeFor` (`NotGrantActor`)
before the relay's `validate` runs, so the rule's real work is the raw-sign path (a hand-built transaction with its own
gas limit), where without it the relay would co-sign a transaction that reverts and pay for it.

**Why:** the relay never pays for a tap its sender may not make.

### D-158 — a delegated tap is pre-checked at the worst the fill can charge (decision, S7, 2026-09-30)

The vault checks the per-tap and daily caps against the actual fill; the browser does not know it before sending, so
`simulateCaps` runs with `spendBase = quote.maxCostBase` (the escrow at the protective limit, ≤ the stake) in both the
ticket's route (`useTicketRoute`) and the lane (`assertGrantCovers`). It can refuse a tap the contract would accept by
a cent; it never passes one the contract would refuse (which would only fail after a signature).

**Why:** "a cap refusal shown with its reason, never a surprise" — the refusal must come before anything is signed.

### D-159 — tap-trading state is one external store with split slices (decision, S7 web, 2026-09-30)

The D37 arm slot lives in the sign-up modal, which the lazy wallet runtime renders outside the app tree, so React
context from the app cannot reach it. `features/session/context.ts` is a tiny store written by the provider only
(`publishSession`), read per slice with `useSyncExternalStore` (view, actions, session-key submitter, root submitter):
a reader re-renders only when its slice changes, and the view re-derives on reads and once at the grant's expiry —
never per second (E.5 S7). Taps routed `vault-grant` reach the session key through the existing `TapSubmitterContext`
(`routeTaps`); cash-outs, collects and wallet calls keep their own signer.

**Why:** one source for every surface, the ceremony's modal included, with no clock-driven re-render.

### D-160 — when tap-trading can't take a call, the CTA says why and offers the fix; the wallet is a labelled choice (decision, S7, 2026-09-30)

Masayume fell back silently to the chosen source (a prompt the user did not expect). Here the CTA's label is the
reason ("Budget used — add $25", "Today's $25 used — resets 00:00 UTC", "Over your $5 per tap — lower the stake",
"Tap-trading expired — renew", "Scheduled calls pay from your wallet"); the budget and expiry cases run their one-step
fix (one passkey confirmation), the rest block; "Pay from your wallet instead · asks your passkey / no prompt" is a
separate tap that switches this composition's route.

**Why:** E.5 S7 "the fallback reason always rendered on the CTA" and the gate's "never a surprise prompt".

### D-161 — vault events are indexed without a Window, applied exactly once (decision, S7, 2026-09-30)

The indexer follows EventVault as a second source (own cursor, window sizing, one `eth_getLogs` per window) and stores
its logs in `idx_events` with `market`/`seq` NULL, so a Window rebuild never replays them and each `idx_vault_*`
projection (index/0002) applies once, in (block, log index) order, with the contract's own arithmetic (a deposit states
the balance; a grant takes its budget; a revoke returns it; buys spend available or the grant's budget; sales and
settlements pay available). The chain stays the truth for money on screen; the projections serve the crank worklist,
`/api/index/wallet/<addr>/vault` and history. Proven equal to `accountOf`/`grantOf` on every real vault log.

**Why:** idempotent, rebuildable and exact without teaching the engine's `seq` machinery about the vault.

### D-162 — "Add to budget" and "Extend" are one root transaction each (decision, S7, 2026-09-30)

Add to budget tops the grant up to its daily cap: `fundGrant` from the free Trading Balance when it holds enough, else a
new intent `vault-deposit-and-fund` = `[approve(vault, x), deposit(x), fundGrant(id, x)]` (never sponsored). Extend and
renew re-grant the same key with the same caps and budget and a later expiry (`grant()` returns the old budget and
takes it back in one call); the contract starts the new grant's day at zero spend — a property of `grant`, kept as-is
(D-003). Re-key does the same for a fresh key on this device.

**Why:** each E.5 S7 action is one tap and one passkey confirmation.

### D-163 — killed-tab evidence counts only inside the record's own life (finding + decision, S7 gate, 2026-09-30)

A tap journaled but killed before its broadcast was reported "landed": the evidence matched the same key's earlier tap
on the same Window. `vaultEvidence` now counts an `Executed` by the record's actor on its Window only between the
record's creation (less 10 s of device/chain skew) and its `validBefore` (+ grace) — an expiring transaction can land
nowhere else; outside, it is "absent" ("never reached the chain, nothing was spent"). Nothing is ever re-sent (AD-3).

**Why:** recovery must not claim a write that never left.

### D-164 — a request the RPC refused for rate is its own diagnosis (finding + decision, S7 gate, 2026-09-30)

**Finding (F-S7-11):** the passkey SDK sends the root's co-signed transaction straight to the public RPC; under the
per-IP limit (D-134, shared by every process on one machine) the node answers "Request exceeds defined limit" and the
write is refused before acceptance. **Decision:** diagnosis kind `rate-limited` (retryable), copy "The network is busy —
too many requests from this connection right now. Nothing was sent — try again in a moment." A production relay and
RPC endpoint off the users' IPs moves the limit away (D-139).

**Why:** the failure card must say what happened and that no money moved.
### D-180 — a branch is measured on the lab gate's host before it is deployed (decision, S4-perf, 2026-09-30)

`lighthouse.yml` gains a `workflow_dispatch` `ref` mode beside the deployed-URL mode (`repository_dispatch` and `url`
unchanged): the runner builds `ref` with the testnet web's public build values (`NEXT_PUBLIC_NETWORK=testnet`, the ops
and stream URLs, `NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000`; no secret) and serves it with `next start` behind
`scripts/perf/lighthouse-serve.mjs`: one origin, `http://localhost:3000`, where `/api/index/*` is the live testnet index
(public GETs, no cookie forwarded) and everything else is the branch. The same `lighthouserc.json` collects and asserts;
`scripts/perf/lighthouse-summary.mjs` writes the median run's LCP/CLS/TBT/script per route, its shifting elements,
longest tasks and costliest scripts to the job summary; the `.lighthouseci` artifact uploads (a dot-directory, which
`upload-artifact` v4 skips unless `include-hidden-files`, the empty-artifact warning) before the assert can fail.

**Why the proxy, not `NEXT_PUBLIC_INDEX_URL=https://testnet.mitoshi.xyz/api/index`:** the deployed index answers with no
CORS headers, and an allowance would only exist after a deploy, so every pre-deploy run would take the chain fallback
path production never runs, and a second origin changes the page's connection graph. Production reads the index
same-origin (`NEXT_PUBLIC_INDEX_URL` unset); the proxy reproduces that with no change to the deployed server. The ops
and stream CORS lists already allow `http://localhost:3000`.

### D-181 — a list re-renders when what it shows changes, not on every clock tick (finding + decision, S4-perf, 2026-09-30)

**Finding:** Lighthouse never sees the app pages go network-quiet (the price stream stays open), so every run lasts
its 45 s limit and simulated TTI lands after the last long task — TBT counts the page's steady state, not just its
load. On /markets that steady state is the clock: the word board read `useNowMs()` and handed `nowMs` to every
WordCard (~60), so each second re-rendered the whole board, each card formatting its close time through
`toLocaleTimeString` (a new Intl.DateTimeFormat per call); the eight lane cards did the same for their phase. A 4×
CPU profile shows a 50–145 ms task every second, WordCard and `formatWallClock` on top.
**Decision:** `useClockValue(derive)` (lib/clock) subscribes to the shared clock but re-renders its reader only when
the derived primitive changes: the board derives the minute it already grouped on, a lane card its Window's phase.
Countdowns tick as their own leaves, as they already subscribed. `formatWallClock` keeps one formatter (same locale,
options and output; `display.test.ts`). Nothing shown changes: the same countdowns, groups and phases, each second.

**Why:** the clock ticks for the numbers that move, not for the sixty cards around them.

### D-182 — metric-matched fallbacks exist on every platform (finding + decision, S4-perf, 2026-09-30)

**Finding** (`lighthouse.yml` branch mode on trunk, run 36689048574): `/` CLS 0.085 is one shift of the pillars
(`section.grid`), caused by "Web font loaded" — Inter and JetBrains Mono, the second font stage — not Sora (D-152's
reserve holds). next/font writes each fallback face as `src: local(Arial)`; the lab's Linux host (like Android and
ChromeOS) has no Arial, so "Inter Fallback" has no face, text renders in the platform sans at its own metrics and
re-wraps when Inter arrives. On macOS the same page measures no height change at any width (Arial exists).
**Decision:** `styles/font-fallbacks.css` repeats next/font's fallback rules for Sora and Inter with next/font's own
overrides and `src` Arial first, then Arial's metric twins (Liberation Sans, Arimo) and Roboto (latin average width
within 0.2 % of Arial) — a superset of next/font's rule, so nothing changes where Arial exists. JetBrains Mono (the
figures) falls back to a monospace face instead of next/font's Arial — Menlo, DejaVu Sans Mono, Liberation Mono,
Cousine, Droid Sans Mono, Courier New all advance 0.600–0.602 em like it — at 100 % with its own ascent and descent.
`font-fallbacks.test.ts` holds the sans overrides equal to next/font's computation and the mono ones to JetBrains
Mono's metrics. The workflow lists the runner's local sans faces (DejaVu, Liberation; no Arial) in the job summary.
Runner (run 36706089863, fonts only): `/` CLS 0.085 → 0.000.

**Why:** a fallback that only exists on Apple and Windows machines is not a fallback for most phones.

## Open questions

Defaults apply until answered; none is a scope cut.

| Q | Question | Default until answered | Blocks |
|---|---|---|---|
| Q-001 | Agent ranking (inherited rule ignores P&L) | Masayume's rule, labelled inherited | S9 gate |
| Q-002 | Names for calls vs themes | "Calls" / "Themes" | S16 copy |
| Q-003 | AI's role in themes | Chooses weights inside the creator's envelope | S16a |
| Q-004 | Themes and mainnet tickers | 5-ticker testnet themes; mainnet list from `14` §2.1 | S16a, S19 |
| Q-005 | Settlement fee | Off (Agari) | S2.1 |
| Q-006 | Open print before taker fills on chain (E-19) | Enforced | S2.1 |
| Q-007 | 24/7 stock lane source; pre-IPO source | Provider 24/7 feeds labelled; pre-IPO paused honestly | S6 |
| Q-008 | Geofence; personal eligibility + budget for mainnet Stock Tokens | US browse-only (+ CA/UK/CH for stocks); no mainnet stock purchase until answered | S1, S19 |
| Q-009 | Testnet bridge route | Base Sepolia hop + request the direct pathway | S14c |
| Q-010 | Robinhood pause → auto-pause the mirror | Display only | S14c |
| Q-011 | Data Streams subscriptions + testnet credentials; RedStone licence | RedStone primary; Streams-only names paused on testnet | S3, S6, S15b, S19 |
| Q-012 | Indexer route | Own follower + Tempo Indexer API for analytics | S3.5 |
| Q-013 | Idle-yield token | Honest "earns nothing" | S18 |
| Q-014 | Y-rows to reopen (Y-02/18, Y-05, Y-07, others) | Masayume's removals stand | S18 |
| Q-015 | Yosuku CSS licence (public repo) | Repo private | S20 |
| Q-016 | Safes per chain (signers, threshold) | Single owner key on testnet only | S19 |
| Q-017 | Moderato v4 | Replay at mainnet addresses | S15a |
| Q-018 | Launchpad constraints | DBC's (10 % locked, ≤ 2 y vesting, 0.2 % + migration fee) | S17b |
| Q-019 | ~~Product name, domain~~ answered by D-060 (Mitoshi, mitoshi.xyz); the pitch remains | — (domain needed before S0's gate; S0 falls back to the Vercel URL and the domain check moves to S1's gate) | S0, S1, S20 |
| Q-020 | Capped mainnet MPP wallet (USDC.e) for agents | None until approved (decisions labelled "unpaid") | S3.5, S9, S16a |
| Q-021 | Also sponsor `EventVault.place` / `moveToPrivate` | Unchanged from Masayume's list (not sponsored) | S7 |
| Q-022 | Engine deviations T01–T10 (A.7), incl. redeem auto-drains own orders, `UnknownRedStoneSigner` vector change, PD-2 knock-out rule for Boost | As designed | S2.1, S10c |
| Q-023 | Mirror naming | "Bridged TSLA Stock Token (unofficial)" / `bTSLA`, own lettermark logo | S14c |
| Q-024 | StockGuard off-hours mode and bands | WIDEN (24/7 at pool price); 150/300/500 bps | S15b |
| Q-025 | Theme creator fee cap | 50 bps | S16c |
| Q-026 | ~~Hosting providers~~ answered by D-061 (Coolify) | Vercel, Fly, Neon, Upstash | S0 |
| Q-027 | App name, bundle IDs, URL scheme | `<reverse-domain>.app` (mainnet, later) / `<reverse-domain>.app.testnet`; scheme = the bundle ID; name from Q-019 + "Testnet" | SM1 |
| Q-028 | Geofence inside the testnet app for App Review (a US reviewer would see browse-only markets) | Same posture as the web, explained in the review notes with a reviewer walkthrough | SM5 |
| Q-029 | Convert the Apple account to an organization (legal entity + D-U-N-S, ~2–3 weeks) for a later public or unlisted listing and the mainnet build | Stay individual; TestFlight only | after S21 |
| Q-030 | Ask Colosseum whether judges install apps and whether judge emails can be shared for internal TestFlight | Ask now (agent drafts); public link + internal path both kept ready | SM5 |
| Q-031 | Wallet-mode access key defaults (D38): daily limit and expiry | Masayume's session defaults: $25/day, 24 h, renewable in one tap | S4 |
