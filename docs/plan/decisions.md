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

### D-090 — S3 builds on S1's ports; the ops chain module is `@cwf/markets/ops` (S3.1, 2026-09-29)

S3 merges `stage/S1-web-shell` @ `082c13f` (as S3.5 did) instead of re-porting Agari's core planners: S1 already ported
`packages/core/src/market/*` (windows, calendar, RedStone schedule, halts, tickers, corporate, earnings) from Agari
03b30ab and `packages/markets/src/tx/send.ts`. The venue actors' chain I/O lives in `packages/markets/src/ops/*`
(`@cwf/markets/ops`: role clients, EngineLens reads through Multicall3, engine call builders, `sendOps` = simulate one
call, then `tx/send.ts` with an expiring nonce, self-paid in pathUSD) and `packages/markets/src/prices/*` (RedStone
payloads, EIP-712 attestations, Data Streams REST). "Fly config" in the stage box is the Coolify app (D-061): the
existing `services/ops/Dockerfile`, health `/health`, `DRY_RUN` default on.

**Why:** one copy of each planner; chain I/O stays in `packages/markets` (C.1.2 boundaries).

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
