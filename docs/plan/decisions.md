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
Passkey rpId = `mitoshi.xyz` on both networks. Brand strings live only in `web/src/lib/copy.ts`. The layout is superseded by
D-228 (2026-10-13): one set of hosts at the apex, no `testnet.` names.

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
### D-165 — the parlay reserve's Tempo seam: rested depth at 20 s, a 0.05 fair-value floor per leg, one spot per leg (decision, S10a, 2026-09-30)

Masayume's `ParlayReserve` ports with its maths, caps and launch parameters unchanged (12 % margin, λ 0.40, 3 legs, 60 %
exposure, 500 per ticket, 1,000 per instant, a 2 % floor, priced over at least 20 contracts). What the Tempo seam adds:

- **D-109 rest floor** `params.minRestSec` = 20 s, the venue grid's own `minRestSec` (`venue-spec.json`); a leg is priced
  over orders rested `max(Series, params)`, so a spoofed offer must sit takeable for 20 s. Agari's `max_spread_ticks`
  guard is not carried (it shipped off; Masayume never had it).
- **PD-2 floor** `params.fairSlackRaw` = 0.05 per whole contract: `openParlay(legs, maxPayout, maxStake, spotProofs)`
  takes one signed RedStone spot per leg (a leg may be on another ticker) and refuses `BelowFairValue` when a leg's book
  price + 0.05 is under the guard's model for that side. One-sided: a leg the book prices above the model is the
  house's gain. The σ is the guard's per-Series σ (the house maker's), so the bound and the quotes share one model; a
  Series the guard has no σ or spot source for refuses by name (`SigmaNotSet`, `NoSpotSource`) — on testnet that is
  every Series but the three crypto 5-minute lanes until their σ is set.
- **L-38**: `lockedByExpiry[E]` is released the moment the last pending leg at E is decided and won (`ExpiryReleased`),
  and at the ticket's end for every boundary not yet released — the mapping, not Agari's 32 slots (D-110's known limit).
- **D-108**: `resolveLeg` takes only the next leg in close order (`nextLegOf`); there is no stale sweep to guard (a leg
  voids only through the engine's permissionless `voidExpired`).
- `LegExpired` stays as a defensive check: the lens derives status from the clock, so a Window past `lockAt` already
  refuses `MarketNotTrading(…, LOCKED)`.
- Deployed by its own key role **`deployer-tickets`** (admin = the broadcaster on testnet, Q-016), funded from `deployer`.

**Why:** A.4.6 and PD-2 require the bound before mainnet; the slack is the smallest tolerance that lets an honest maker's
quote survive the spot moving between its requote and the open (5-minute crypto lanes move ≈ 1–3 ¢ a minute near the
money). `setParams` tunes both without a redeploy.

### D-166 — parlay relay policy: the opener's trade, cranks and exits sponsored; supply and admin never (decision, S10a, 2026-09-30)

`relay/policies/parlay.ts`, registered in `POLICIES`. **Sponsored:** `openParlay` (the opener's own stake at the chain's
floored price under their `maxStake` — a trade, like `EventsEngine.placeOrder` under D-135), `resolveLeg` (permissionless
and idempotent), `claim` (pays the owner whoever calls), `claimOwed` and `withdraw` (pay `msg.sender`, P12). **Never:**
`supply` (capital intake, D-020/D-029) and `setParams`/`setPaused`/`setAdmin`. An exact `pathUSD.approve(reserve)`
rides along with an open; `openParlay` is the markets entry for the geofence; `maxGas` 6M (measured in the S10a live
gate). The wallet-mode key stays scoped to the engine (D-136): a parlay is signed by the passkey, one prompt.

**Why:** the reserve pays nobody but the ticket's owner or the caller, so sponsoring moves no one else's money; the
supplier's capital pays its own way in, as in the maker vault (D-118).

### D-167 — the parlay web: E.4's slip, a passkey-signed open, a signed spot from our own route (decision, S10a, 2026-09-30)

- **Composition (E.4):** the Windows list is 21st 109's product list (the two sides are the "Add" buttons) instead of
  Masayume's per-leg dropdown; the slip is 109's cart with 29940 as the per-leg **Window stepper** (a leg moves to a
  later round of its lane — the "29940 per leg" slot; a parlay has no per-leg quantity), 29356 totals, 16240's chips,
  23527's hold, in the rail from `lg` and the 31360 right-edge slide-over below it, opened from a floating dock that
  sits above the phone nav and receives 24524's arc.
- **Signing:** a parlay open is signed by the account's passkey (one prompt), not the wallet-mode key: that key is
  scoped to the engine's selectors (D-136) and would be refused `CallNotAllowed`. Settle and claim are the same lane.
- **The PD-2 proof:** `/api/prices/redstone-payload?feed=…` builds the `verifySpot` payload server-side from the
  RedStone gateway (`@cwf/core/prices/redstone` `latestSpot`, the venue's five signers, threshold 3, feeds limited to
  the venue's own, no cache, one gateway fetch shared for 1.5 s). The slip re-reads it every 15 s and checks each leg
  against the guard's `previewFairUpE6` at that spot + the reserve's slack — the rule the open enforces — so a refusal
  is named before the hold; the payload itself is sent when younger than 60 s (the guard allows 120 s), else fetched
  again. The reserve's caps are asked with `checkCapacity` (the view `previewOpen` does not cover).
- **Only priceable Windows are offered:** a lane whose Series has no σ or whose ticker has no spot source in the guard
  is listed apart, disabled, with the reason ("no fair-value model yet") — never offered and then refused.

**Why:** E.4 names the composition; the signing and proof choices follow from D-136 and PD-2.
### D-171 — private bets: keys from a committed browser secret, the desk service self-pays, claims kept per account (decision, S10d, 2026-09-30)

- **Keys (C.2.4, L-39):** Masayume seeded a slot's three keys (slot id, charge key, credit key) with the owner's
  authorisation signature — reproducible only because secp256k1 signing is deterministic. A passkey's P-256/WebAuthn
  signature is randomised, so a retry would open a second slot. The browser draws a 32-byte secret; the signed text
  names `Keys: keccak256(secret)`; the open request carries the secret; the route checks the commitment and the
  signature (viem's Tempo `verifyHash`: P-256, WebAuthn, keychain, secp256k1) against the text it rebuilds from the
  chain's own Window, then the desk derives the keys from the secret. Same secret, same slot: nothing charges twice.
- **Desk service (C.3.8):** server-only (`@cwf/markets/server`), the testnet `desk` role key (`DESK_PRIVATE_KEY`),
  self-paid Tempo transactions through `sendOps` (never the relay, D-177). Every step is simulated as the desk first
  (a refusal comes back by the contract's name, nothing paid) and skipped when the chain shows it landed; one request
  per slot at a time. A refused mint sweeps the slot and credits the stake straight back.
- **Claims per account:** `private_claims` (Postgres) keeps each claim under its owner — the reference kept them only
  in the browser, which loses money on a new device and has no place in the app. The row holds the signed request
  (with the secret) only while the desk has not answered definitively, so a lost reply is resumed from the server and
  never re-signed; it is cleared once the bet opened or was refused. The list is served only to the owner's own
  session. The desk operator can therefore join a slot to its owner — the chain cannot; copy says "harder to link
  back to you", never "anonymous".

**Why:** A.4.4 on passkeys, with the reference's lost-reply safety and without its browser-only claims.

### D-172 — the range reserve's Tempo seam: engine prints in cents, a ticker per asset, a 2σ drift bound on a same-call spot (decision, S10b, 2026-09-30)

Masayume's `RangeReserve` ports with `RangeMath`, its vectors and its launch parameters unchanged (12 % margin, 60 %
exposure, the centre read over 20 contracts a side, spread ≤ 0.20, a 3 %–97 % centre, a 2 %–97 % band probability,
60 s–2 days, 6 h stale grace, 500 per round, 1,000 per instant). The OracleHub and `WindowQuestion` go:

- **Prints:** the opening print is the engine's recorded open and the closing print its recorded close, both
  `priceE8 / 1e6` → cents (floored, so a sub-cent remainder never lifts a close over a band edge; edges are inside).
  A voided Window refunds through `settle`.
- **Asset proof:** `setAssetTicker(asset, ticker)` binds an asset name to an engine ticker; `openRange` refuses
  `NoTicker` / `WrongAsset` unless the Window's Series carries that ticker (in place of the hub's question key).
- **Centre (D-109, Agari's mark factor):** the YES mid over rested depth at max(Series, params) `minRestSec` = 20 s,
  on the scale `PAIR_TICKS × tickBase` (the engine's grid makes that `one`), so a 0.65 mid reads 650,000.
- **PD-2 / D-119:** `openRange(…, spotProof)` verifies a signed spot for the Window's ticker through the
  FairValueGuard's `spotOf` and refuses `StaleBasis` when `|probitE4(centre) − z(spot)| > maxDriftE4` = 20,000 (2σ),
  z taken with the reserve's own σ over the seconds to expiry (RangeMath's linear z, as the band maths). Two-sided;
  `previewDriftE4` answers the same test for a spot the client supplies. The spot and drift are kept per round.
- **D-108 (Agari):** `voidStale` refuses `MustSettle` while the engine has resolved or voided the Window.
- **σ:** Masayume's measured BTC 6,200 and ETH 7,800; SOL (never listed by Masayume) the house maker's 14,245 until
  measured. Assets are the three crypto 5-minute lanes, the only tickers the guard has a spot source for on testnet.
- `minTimeLeftSec` counts to `lockAt` (no entries in trading's last minute), τ to `expiry` (T08).

**Why:** A.4.7 and D-119 — a quiet book pins the distribution while the spot runs; with a signed spot in the call the
reserve refuses on chain what Agari could only refuse in the browser.

### D-173 — range relay policy: the opener's round, settlement and exits sponsored; supply and admin never (decision, S10b, 2026-09-30)

`relay/policies/range.ts`, registered in `POLICIES`, D-166's rule for the range reserve. **Sponsored:** `openRange`,
`settle`, `voidStale`, `claim`, `claimOwed`, `withdraw`. **Never:** `supply` and `setParams`/`setVolatility`/
`setAssetTicker`/`setPaused`/`setAdmin`. `openRange` is the markets entry; `maxGas` 6M. Moonshot rounds are range rounds.

**Why:** every sponsored call pays only the round's owner or the caller; capital pays its own way in.

### D-174 — the leverage reserve's Tempo seam: Agari's D-114/D-116 carried, PD-2 on entry and on the knock-out (decision, S10c, 2026-09-30)

Masayume's `LeverageReserve`/`LeverageGateway`/`LeverageMath` port with the maths, vectors and launch parameters
unchanged (3×, 8 % premium on the front, 120 % maintenance, 60 % exposure; entry 0.05–0.95, 200 per position, 500 per
Window, 64 open, no opens in the last 90 s — now counted to `lockAt`). The DreamDEX pool and ERC-6909 become the
reserve's own engine position:

- **Measured trades (D-114):** every buy and sale is an IOC through `EngineSeam.placeMeasured` (`withdrawProceeds`,
  `expireSec = min(now + 60, lockAt)`), every settlement a `redeemPartialMeasured` of exactly the position's lots; a
  report that disagrees with the money reverts `EngineAccountingMismatch`. `sweep(bytes32 marketId)` replaces
  `sweep(pool)`; the real engine never leaves a taker a credit, so it finds nothing.
- **Healthy and sellable at birth (D-114):** after the fill, rested depth (max(Series, params) `minRestSec` = 20 s) must
  take the whole size (`ThinBook`) at a mark above the line (`UnhealthyAtEntry`). The entry itself takes live orders.
- **Knock-out (D-114 + PD-2, Q-022):** judged on the whole position over rested depth — a thinned book refuses
  (`ThinBook`) instead of Masayume's partial sale — sold with the last rested level as the limit, and only when the
  fair-value mark on a same-call signed spot (`fairSide × quantity`) is also under the line (`FairValueHealthy`).
  `knockOut(id, spotProof)`; `markOf` (book) and `fairMarkOf(id, spotE8)` (model) preview both halves.
- **Entry ceiling (PD-2):** `open(…, spotProof)` refuses `AboveFairValue` when the side's entry price is more than
  `fairSlackRaw` = 0.05 above the model (a ceiling: a cheap entry is the owner's gain).
- **Void bound (D-116):** `fronted × PAYOUT_DENOMINATOR ≤ quantity × PAYOUT_VOID` on the quote and on the fill
  (`VoidWouldShort`): 3× refuses above ≈ 71¢, 2× never does.
- **Pay or owe (D-114):** every exit pays the owner through `_payOrOwe`; the open's change goes back the same way;
  a supplier's own withdrawal is P12-checked.
- The `LyingEngine` gained the lens reads the reserve needs (a one-level book, the grid, a ticker/Series/open print,
  terminal flags) so the accounting assert is proven for buys, sales and redemptions.

**Why:** A.4.3, Agari's D-114/D-116 and PD-2 — a reserve that fronts capital must not be knocked out or opened on a
book someone arranged, and a void must never cost its suppliers the front.

### D-175 — Boost relay policy and the leverage-keeper: owner trades, exits and cranks sponsored; the keeper proves its own spot (decision, S10c, 2026-09-30)

`relay/policies/leverage.ts`, registered in `POLICIES`, D-166's rule: **sponsored** `open`, `close`, `knockOut`, `settle`,
`claimOwed`, `withdraw`, `sweep` (every one pays only the owner, the caller, or moves the reserve's own credit);
**never** `supply` and `setParams`/`setPaused`/`setAdmin`; `open` is the markets entry; `maxGas` 7M. The
**leverage-keeper** (Masayume's actor, onto `runActor`, in the default ops set, `keeper` role) cranks `settle` once the
engine decides a Window and `knockOut` only when `markOf` says rested depth takes the whole position under the line
AND `fairMarkOf` at a fresh RedStone spot (built from one gateway `latest` response per pass, the verifier's own signer
set and threshold) agrees — the proof it sends is that same spot. It pays its own fees (ops budget); without the key or
under `DRY_RUN` it scans and reports.

**Why:** knock-outs and settlements must never wait on the owner or on a user remembering to crank; the keeper sends
only calls the contract would accept, and never a knock-out the model would refuse.

### D-176 — the private desk's Tempo seam: Agari's D-117 carried; the claim is EIP-712 over this contract, verified against its `desk()` (decision, S10d, 2026-09-30)

Masayume's `PrivateDesk`/`PrivateGateway` port with the owner/slot split, the keys and launch parameters unchanged
(a 1–25 stake band, no mints in the last 60 s — counted to `lockAt`). On the engine:

- **Custody (D-117):** a slot's mint is a measured engine IOC (`placeMeasured`) and its settlement a measured
  `redeemPartial` of exactly its lots; the desk's one engine position pools every slot's contracts, and the invariant
  suite proves that position equals the unsettled slots' contracts per Window and side. `owed + pool + inSlots` equals
  the wallet after every call; `owed` and `inSlots` equal their sums over owners and slots.
- **A credit needs a budget (D-117):** `creditFromPool` refuses `NoBudget(owner)` unless the owner has ever deposited
  (`hasBudget`, set by the first deposit and never cleared, so a payout can still reach an owner who withdrew to zero).
  Tighter than Masayume, which credited any address; a compromised desk key cannot credit itself.
- **Sizing** walks every live order (not rested only): the desk spends the owner's own stake under the owner's own
  guard, so PD-2's rested rule, which protects a reserve's capital, does not apply (D-117).
- **P12:** the owner's `withdraw` refuses `ReceivePolicyBlocked` rather than pushing into the guard.
- **Claims (PD-4):** the desk service signs the Masayume claim (owner, slot, credit key, market, side, stake, issued) as
  EIP-712 with `chainId` and `verifyingContract` = this contract; anyone verifies it against the on-chain `desk()`.
  The contract pins the key only — no claim is submitted on chain. Desk key = the testnet `desk` role (`0x9540…4cb9`),
  never the deployer; `setDesk` rotates it.
- The pause stops charges and mints only; `sweep(marketId)` books any engine credit (none arises) into the pool.

**Why:** A.4.4 and D-117 — link-reduction with conservation a random sequence cannot break; never "anonymous".

### D-177 — private-desk relay policy: the owner's exits and the settle crank sponsored; intake, delegation, the desk key and admin never (decision, S10d, 2026-09-30)

`relay/policies/private.ts`, registered in `POLICIES`, the trading-balance rule (D-118): **sponsored** `withdraw`,
`revoke`, `settleSlot`, `sweep`; **never** `deposit`/`depositAndAllow` (intake), `allow` (delegation setup, as the vault's
`grant`), the desk key's `chargeToPool`/`fundSlot`/`mintInSlot`/`sweepSlotToPool`/`creditFromPool` (the desk service
pays its own fees from the ops budget) and `setDesk`/`setParams`/`setPaused`/`setAdmin`. `deposit`/`depositAndAllow`
are the markets entry; `maxGas` 3M.

**Why:** an owner must always be able to take money back or cancel the desk's permission without funds; the desk's
own sends are an operator cost, not a user's.

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

### D-183 — what is off screen or not yet used costs the main thread nothing (decision, S4-perf, 2026-09-30)

**Finding** (4× CPU traces, local and on the lab host): after D-181 the /markets steady state is still the rendering
pipeline — each second ~70 countdowns change text and the browser re-lays out ~230 of ~2,600 layout objects and
repaints (50–100 ms tasks at 4×), and the first data render lays out ~2,500 objects at once; ~50 of the 58 cards are
screens below the fold on a phone. MotionScope's lazy `import("motion/react")` pulled the whole motion entry.
**Decision:** word-board and lane cards take `content-visibility: auto` with their measured heights as
`contain-intrinsic-size: auto …` (224/269 px, 342/475 px): off screen a card keeps its place and skips style, layout
and paint, stays in the DOM, the accessibility tree and find-in-page, and renders as it nears the viewport; its
countdown and price keep updating the DOM. MotionScope loads `domAnimation` from a module of its own
(`components/motion-features.ts`, motion docs "Reduce bundle size"), so the lazy chunk is the feature package.

**Why:** the lab counts every long task for the page's whole life; cards nobody can see should not be drawn every
second.

### D-184 — a list renders its data in the background, from one subscription (finding + decision, S4-perf, 2026-09-30)

**Finding** (4× CPU trace on the lab host, after D-181/D-183): /markets' longest task is the lane list's arrival — one
~250 ms synchronous render of the hero, the lane page and ~50 word-board cards (TanStack's store updates render
synchronously), repeated on every lanes refetch (poll or stream event); and each card subscribed to its own book, so a
batch of book answers re-rendered every card in one blocking pass.
**Decision:** `useLanesState` reads the lane list through `useDeferredValue` (React 19): the page first re-renders
with the previous list (children bail out), then renders the new one in the background, time-sliced and
interruptible — the same content, drawn in pieces. The lane page and the word board read their Windows' books through
one `useQueries` subscription each (`useBookDepths` / `useTopsOfBook`): every Window keeps its own depth query — the
same key, read, poll and stream invalidation as a card's `useBookDepth` (`bookDepthQuery`; `book-depths.test.ts` shows
one fetch answers both with the same value) — and the list takes the answers at once, deferred, handing each card its
top as plain values so only cards whose numbers moved re-render. Real books on Moderato (the gate maker's quotes, this
build vs the deployed trunk at the same moment): 50 of 51 word cards equal, the one difference a poll caught between
answers, once in each direction.
The signed-out Portfolio is the connect card alone: the signed-in ledger (Trading Balance controls, tx components,
charts) is its own island chosen by `PortfolioPage` (D-183), one chunk hop as before for a signed-in visitor.

**Why:** the lab counts the page's long tasks; the same pixels arrive in slices instead of one blocking pass.

### D-185 — 24/7 stock Windows never open or close on RedStone's 04:00 ET `---24_7` gap (finding + decision, S3 fix 2, 2026-09-30)

**Finding** (`print_archive`, every 5-minute boundary 2026-09-28 00:30 → 09-30 09:45 ET present; RedStone gateway
`historical` probed 2026-09-30 13:49Z): RedStone publishes no `<T>---24_7` package, and no `---PRE_AFTER`, stamped
exactly 04:00:00 ET, the overnight → pre-market switch: 0 signers for all seven 24/7 names (TSLA, NVDA, AAPL, MSFT,
META, GOOGL, AMZN) on 09-28, 09-29 and 09-30 at 08:00:00Z, while 03:59:50 and 04:00:10 carry 5/5 and the plain,
`---EXTENDED` and BTC/ETH/SOL feeds are complete at that instant. The engine's verifier admits only packages stamped
exactly T (`RedStoneTimestampMismatch`), so a Window whose open or close T is 04:00 ET can never print: at 2026-09-30
08:00Z the soak voided 42 (7 names × 3 cadences × the Window ending there and the one starting there). No other
archived boundary on a feed a lane depends on is short: 09:30, 16:00 and 20:00 ET carry 5/5 on `---24_7` (gateway,
09-29/30), crypto has none, and the plain feeds' only short boundaries are 09:30:00 ET on 09-15 (AMZN, MSFT: 2 signers)
and 09-16 (GOOGL: 2) in the laptop archive (regular hours only, each fetched once; 09:30:10 was 5/5) — sporadic, none
in the three ops-archived sessions, so the SessionOpen Windows stay listed (a miss there voids with funds returned).
**Decision:** the roller never lists a 24/7 stock Window printed by RedStone whose open or close T is 04:00:00 ET
(`isRedStone24x7Gap` in core, ET wall time from `et-time.ts` like the calendar: 08:00Z under EDT, 09:00Z under EST).
03:55–04:00 and 04:00–04:05 (5m), 03:45–04:00 and 04:00–04:15 (15m), 03:00–04:00 and 04:00–05:00 (60m) ET are not
listed; the grid does not shift (every Window stays aligned to its cadence, as the engine checks). The next Window
(04:05, 04:15, 05:00 ET) lists when the first skipped one would have (the lead before 03:55, 03:45, 03:00 ET), so the
lane shows it with the existing "OPENS <time>" line instead of sitting empty. Crypto, Data Streams versions and the
Regular and Gap lanes are unaffected. The rule applies every day: the archive holds no weekend of `---24_7` yet; if Sat
and Sun 04:00 ET prove complete (archive, 2026-10-03/04), it narrows to session days.

**Why:** no lane is removed; only the Windows RedStone cannot print are.

### D-186 — a pass that can't read RedStone is a fetch failure in health, never a halt; halt-replay replays in write order (finding + decision, S3 fix 2, 2026-09-30)

**Finding:** halt-watch confirmed every RedStone-sourced asset `redstone-stale` at once — the 19 watched in hours on
2026-09-29 14:45:46–14:48:08Z, the 10 always-on ones on 09-30 10:00:46–10:04:11Z — while RedStone was current (the
archive holds 5/5 at those boundaries): the ops box's own `latest` fetch was failing under host load (agari-box OOM,
`context/ops/agari-box-oom-*`), so every feed's newest package aged past 60 s together, and users would have seen
"Signed price stale" for ≈ 3 min. The gate's `halt-replay --from 1790665440` MISMATCH was a second defect: `/halts/log`
selected `id::text` and ordered `by id`, which Postgres resolves to the text output column (1, 10 … 19, 2, 20 …), so
rows 40, 50 … 80 were replayed after rows 4 … 8. In id order the recorded log replays exactly (82 passes, OK).
**Decision:** (1) the spot feed counts a read only when RedStone answers with our feeds and a package younger than 60 s;
a failed or all-stale answer is a spot-feed failure (heartbeat, `/health` failing after 3 in a row) and leaves
`lastReadSec()` unchanged. (2) halt-watch observes a RedStone-sourced asset `unread` when its view is older than 30 s
(three spot reads) or when every watched RedStone feed (≥ 2) is stale at once; an unread pass moves neither a confirmed
reason nor a pending streak (Alpaca's exchange halt still applies), is logged to `halt_log` for replay, and `/health`
shows it (`halt-watch` detail `redstone`: readable, why, last read age, since, passes). One feed stalling while others
are current still halts after two passes. A RedStone-wide stop also reads as unread: the roller keeps listing and a
Window that can't print voids with funds returned; no label claims a stale market we did not observe. (3) `/halts/log`
orders by the numeric id and `halt-replay` sorts rows numerically. What it compares: each recorded pass's observed
reasons fed back through `stepHalts` must give the recorded board, so it proves the board follows the rules from what
halt-watch saw; it does not re-read RedStone, and it flags the pre-fix all-at-once passes.

**Why:** a label must describe the market, not our own fetch.

### D-187 — recount walks logs in windows the RPC accepts and counts every source the index holds (finding + decision, S3 fix 2, 2026-09-30)

**Finding:** the end-of-soak `recount.ts` died on its fixed 50,000-block `eth_getLogs` windows: Moderato refuses a
window holding more than 20,000 logs with `-32602 "query exceeds max results 20000, retry with the range A-B"`, B being
the last block that fits (probed 2026-09-30). Since S7's deploy (ops 13:48Z) the index also holds the EventVault's logs
in `idx_events` (D-161), which the engine-only recount would count as a mismatch, and it waited for any cursor, not
every one. **Decision:** `walkLogWindows` (`@cwf/markets/ops`) covers a range exactly once, in order: a refused window
is retried with the range the RPC names (else halved, down to 100 blocks), and every answered window doubles the next up
to 100,000 — the ops indexer's rule plus the RPC's hint. `recount.ts` walks the engine and the vault through
`tempoHttp` (D-130), counts the vault's decodable events by name, and waits until every source's cursor has reached its
pinned head before diffing.

**Why:** the gate's "recount == index" must run to the end against the live chain.

### D-188 — `print_archive` stores JSON objects, not JSON strings (finding + decision, S3 fix 2, 2026-09-30)

**Finding** (reading the archive for D-185): every one of the 1,310 `print_archive` rows (ops since 09-28, the laptop
import 09-14 → 09-22) holds `summary` and `feeds` as a JSON *string*: the writers passed `${JSON.stringify(x)}::jsonb`
and postgres.js serializes a jsonb parameter with `JSON.stringify` again (its type table: json/jsonb ← `JSON.stringify`;
`sql.json(value)` is the documented form, Context7 `/porsager/postgres`). So `feeds -> 'BTC'` and `feeds ? 'BTC'` are
NULL/false on every row and each reader silently finds nothing: the relay's archive proof for a Gap open past the
gateway's 23 h (`archivedFeed`), the calendar's RedStone `NY_MARKET_NEXT_CHANGE_TIME` observations (ops logged "1
RedStone observations": only the gateway's latest, not the archived day), `/prices/latest`'s fallback after a restart,
and the web's archive route. **Decision:** the archive actor and `scripts/archive/import-agari.ts` pass
`sql.json(value)`; migration `prints/0003_print_archive_objects.sql` unwraps the stored rows in place (idempotent;
≈ 17 MB of `feeds`). Proven on a real Postgres with a real archived boundary (2026-09-30 04:00 ET): the old form stores
a string, the migration unwraps it, and the relay's read, the web's key test and `/prices/latest` find the packages.

**Why:** the archive is the evidence and the fallback source; a row nobody can read is not archived.

### D-189 — owner answer (2026-10-08): the revamp's look

**Mitoshi keeps its palette, fonts and 見通し identity; the shell's structure follows roy-chain/Slush and the Markets
screen follows tradash.xyz's behaviour.** The owner asked (2026-10-08) to "redo markets in the direction of the
tradash thing" (the one-screen trading terminal Owarine is migrating to, sounds included) and to take roy-chain's
sidebar, modals and screens (modelled on the Slush wallet). Asked which look the revamp keeps, he chose Mitoshi's
colours: Tradash supplies behaviour, motion, sound and copy pattern; roy-chain/Slush supplies structure (rail, stage,
drawers, centred modals). **Supersedes** D-009's "nav, layout" for the app shell and the Markets screen (colours and type
stay), D-036's "native tab bar reproduces Masayume's floating pill nav" (the app's tab bar mirrors the new dock), and
plan §2.1.5 "no tutorial wall" for the terminal (D-191). References, authority order, provenance and the parity ledger:
`docs/plan/revamp-parity.md`; stages S22 (shell), S23 (terminal), S24 (exits).

### D-190 — owner answer (2026-10-08): overlays stay right-edge and centred

**The owner overlay rule stands:** every Tradash bottom sheet becomes a roy-chain/Slush floating right drawer (inset 16,
width 384 / wide 560, radius 24, 2 px edge, no blur; full width minus the inset on phones), and small choices (Add/Reduce,
share, sign-out confirm, provider info) are centred modals. Drawers carry their state in the URL (`?d=`) so Back closes
them. D-056's right-edge More panel stays as the "Everything" drawer.

### D-191 — owner answer (2026-10-08): no simulated balance

**Tradash's demo mode ($10,000 simulated, "Reset demo balance", "Try Demo / Try Live") is excluded by the owner.** The
5-step tour ends in "Start trading": one passkey, the faucet-funded Moderato account (labelled testnet), the one-tap arm,
back on the terminal. Every trade in the terminal is real on Moderato. **Supersedes** D-046's "the 5-step tutorial folds
into contextual first-use explainers" for the terminal (the explainers stay everywhere else).

### D-192 — owner answer (2026-10-08): the terminal's route

**The terminal is `/trade/[symbol]`, the trading home.** `/markets` stays the full list (lanes, "Your calls", the word
board, Surface) and every row opens the terminal; `/markets/[id]` becomes a server redirect to `/trade/<SYM>?w=<id>`,
keeping "settled → successor" with its note (L-21). Universal links (D-041) add `/trade/*`.

### D-193 — owner answer (2026-10-08): exits that run with the app closed

**Trading Balance v2 adds a sell-only EXIT grant with an on-chain floor; an ops `exit-keeper` runs Trail, TP and SL with
the app closed.** Trust model: the keeper decides *when* to sell (on the display feed, D-196); the contract decides the
*lowest price* — each keeper sell carries a floor of `fairUpE6(m, RedStone proof)` less a stated tolerance
(`previewFairUpE6` is "never a bound", `FairValueGuard.sol:81`); `OpenPrintMissing`/`SigmaNotSet` refuse the sell and
ops sets σ for every Series the terminal trades. The EXIT grant has no budget path (sell-only by construction), lives in
a split `VaultExits.sol` (EventVault is 384 lines), is granted with one root passkey prompt and listed/revocable in
`/settings/account`. A contract stage under the money gate (S24) with a fresh Moderato deploy and a v1 → v2 migration
(withdraw from v1, settle v1 positions, index both vaults). Until S24 lands, exits run in the tab (D-200).

### D-194 — owner answer (2026-10-08): the house keeps its exit side to T−30 s

**The seed maker keeps only its bid (exit) side from T−75 s to T−30 s**, at a wider spread, with short-TTL requotes and
inventory/spread caps, so CLOSE works almost to lock (today every quote is pulled 75 s before lock). The lock−30 cap
(`seed-maker/quote.ts:60`) and the Regular session-close pull stay. S24.4.

### D-195 — owner answer (2026-10-08): Aura becomes a season league

**Tradash's "Bulk Aura" (the exchange's points programme) becomes a Mitoshi season league** in S13: weekly points from
real trades and streaks, shown in the terminal's account drawer.

### D-196 — the chart's line follows a display feed; settlement never does (decision, revamp, 2026-10-08)

The terminal's line moves on every trade, so it needs more than RedStone's 10 s grid. An ops `DisplayFeed` — Coinbase
Exchange WebSocket `ticker` for BTC/ETH/SOL (after 5 s quiet: Owarine's 5-venue REST median; then RedStone, labelled),
Alpaca latest trades for stocks in NYSE regular hours (off-hours: RedStone `<T>---24_7` at 10 s, labelled "updates every
10 s") — is coalesced globally to ≤ 8 Hz per symbol and published on **one `ticks` topic** *ephemerally* (outside the
5,000-event replay ring), so a market switch never changes the SSE topic set. It is **never joined into `SpotFeed`**:
the seed maker, halt-watch, `price_ticks`, `/prices/latest` and settlement stay RedStone. The seed maker reads the
display feed only as a risk signal and widens or pulls quotes when display and signed prices diverge beyond k·σ√Δt. The
chart marks the latest signed value of the Window's basis feed, and the copy that said "the chart follows the same feed"
changes. **Supersedes** D-049's "charts updated with `series.update()`" and its "setQueryData" for display ticks (they
go to an external ring store, not the query cache).

### D-197 — the PnL on the line is what CLOSE pays; CLOSE is one tap (decision, revamp, 2026-10-08)

**Live value** = `exitFromBook().proceedsBase` (read with `minRestSec = 0`; the IOC limit protects the user) on book
events and every 5 s, repriced between reads by Δ`fairProbUpE6` on the display spot and capped at the book walk; shown
"≈" while repriced. `markValueBase` (last trade) is no longer shown as PnL. **CLOSE** is one tap with no hold: the floor
is the last book `ExitQuote.minProceedsBase` less the user's close tolerance (never the reprice); a requote inside the
tolerance is accepted automatically, outside it a toast offers "Close for $X"; reads run in one parallel round and
`onSigned` shows "Closing…". Vault positions get the missing sell lane (`placeFor(isBuy=false)`). **Supersedes** the
Portfolio cash-out's hold-to-confirm (S4 `BetRow`) on the terminal and on Portfolio.

### D-198 — ports from the owner's reference products count as the component source (decision, revamp, 2026-10-08)

A surface ported from Owarine (`ecb7565b`) or Baku/roy-chain (`ede3ed38`) — the owner's own MIT repos that already hold
the reference behaviour — starts from that port, not a fresh 21st pick; the 21st search still runs for any surface with
no reference source, and every adoption gets a `components.md` row and a trailer (`Ported from Owarine ecb7565b:<path>`
/ `Ported from Baku (roy-chain) ede3ed38:<path>`). Ports keep D-044's rules: Base UI only, lucide icons (roy-chain's
Phosphor icons are replaced), `m.*` under `LazyMotion`, tokens only. **Carve-out of** D-044's "every UI step names its
21st starting component".

### D-199 — a canvas chart engine on `/trade` (decision, revamp, 2026-10-08)

The terminal draws with Owarine's two-canvas engine (600-sample ring on a fixed 60 Hz clock, dt-corrected easing,
Catmull-Rom, rolling-digit pill, DotGrid, candles with gestures) rather than lightweight-charts; colours and fonts come
from CSS variables re-read on theme change. lightweight-charts stays only where a screen still uses it and leaves when
the last one moves.

### D-200 — exits in the tab; TP/SL defined on exit value (decision, revamp, 2026-10-08)

Until S24's keeper is live, Trail, TP and SL are evaluated on committed ticks (not animation frames), the price stream
stays open while an exit is armed even with the tab hidden, the signer is the wallet key for wallet positions and the
session key for vault positions, arming is refused when the key expires before the Window, and the label says "Only
while Mitoshi is open". Trail is on spot with the break-even spot as its reference (Tradash's rule); TP and SL in ROI %
and P&L modes are defined on exit value (what CLOSE pays); the Change % mode converts to spot and is labelled "≈".

### D-201 — owner answer (2026-10-08): one branch, no worktrees

**Work runs sequentially on `integration/t1`; no git worktrees, no parallel stage or slice branches, no lanes.** The
owner stopped a four-worktree wave ("it is slower; don't spin up work trees") and clears the session between stages
themselves. **Supersedes** `fragments.md`'s worktrees in `../cwf-wt/<name>` and `stage/…`/`slice/…` branches, plan §4's
branch naming and §7's "≤ 4 agents per wave" for the stages still to run, and the revamp's "wave R": S22, S23 and S24
run one after another on the trunk (order in STATUS).

### D-202 — the terminal's toasts keep the colour law (S23, 2026-10-08)

**Toasts take Tradash's mechanics, not its green and red.** `lib/toast` gains an `id` (the same id replaces a toast in
place: "Opening Up BTC…" becomes "Up BTC opened"), a `loading` state kept until replaced, a timeout and one action
(Sign in, Close for $X, Add $25). Colour stays neutral for records and warning for degraded truth (the S1 law); a
win's colour lives on the chart and in the confetti, never on the toast plate. **Supersedes** RV-16's "success /
error / info" toast types (the durations and placement stand).

### D-203 — the terminal's Window rule and the dock (S23, 2026-10-08)

**The terminal stays on a Window through its last 30 s** ("closes 0:25", buttons blocked with the no-entry reason)
instead of moving into the next Window's scheduled call: one tap means a fill, and a resting order at a cents price is
a different act the user chooses (`?w=` on a prelisted Window, D-088). A symbol opens on the first lane, in offer
order Regular → 24/7 → Gap and shortest cadence first, with a Window open for entry now; `?lane=` pins one.
**The phone dock is Trade · Stocks · Games · Portfolio · More** (five slots fit 320 px); Markets, the rail's second
place, is listed in Everything for phones and is one tap from the terminal's markets drawer. **Supersedes** `useTicket`'s
advance-in-the-buffer for the terminal only (the Markets ticket keeps it), and S22's four-place rail.

### D-204 — the exit tail keeps both sides (S24.4, 2026-10-08)

D-194's "bid (exit) side" is two orders on this engine, not one: an Up holder sells YES into the house's YES bid, and a
Down holder sells NO, which on the YES book is a buy at the house's ask. A bid-only tail would leave every Down position
without a buyer in the last minute. **So from lock − 75 the seed maker keeps both sides in an exit tail**, which:
- keeps a pair already resting, since it lives to lock − 30, and never refreshes one that rests that long;
- places only what it must (nothing rests, the fair moved, the guard widened), at half the lots (at least the Series
  minimum) and twice the half spread (at least 30 ticks wider);
- places nothing new from lock − 45, and skips any placement the pass reaches with under 8 s left to rest;
- lets the resting pair expire at lock − 30 rather than cancelling it.

The first build widened every resting pair at lock − 75. On 2026-10-08 that was a send storm at 17:00 ET, when the 5m,
15m and 60m Windows lock together: one pass took 92 s, and late placements paid fees for `OrderAlreadyExpired`. So the
tail now widens only new placements, and each Window is tended on the chain clock of its own moment, not the pass's
start. The same reading found a requote whose cancel landed while its placement was refused by the RPC gateway's rate
limiter (−32005; viem never retries a raw send). That left the BTC 5m book empty, so the split send now resends the
same signed bytes with backoff, which can never send twice (`tx/send.ts`, D-134).

A pull (halt, stale spot, Regular close − 120) still cancels at once. The capital stays the ops maker account's pathUSD
under the per-Window caps (`MM_MAX_CASH_PER_WINDOW` $50 Regular, `MM_ALLDAY_MAX_CASH_PER_WINDOW` $10 24/7, `MM_GAP_MAX_CASH`
$25 Gap). An entrant in the tail pays the same wide spread as an exit, because one order can't tell the two apart.
Brought forward from S24 because the terminal's first CI trade closed for $0.04 after lock − 75 (F-S23-04).
**Refines** D-194's mechanism; its promise (CLOSE works to T−30 s) is unchanged.

### D-205 — a taker reads the book at rest 0 (S23d, 2026-10-08)

**Every taker-facing book read — the stake quote, the exit, the sell lanes, the depth shown — passes `minRestSec = 0`**
(`TAKER_MIN_REST_SEC`). The engine's matching takes any live, unexpired order however young: `MatchCore` writes
`placedAt` and never reads it. A Series' `minRestSec` (20 s on Moderato) is the rested-depth guard for products that
price on chain (Leverage, Parlay, Range: `engine-gas.md`), and they keep it. Read at 20 s, every maker requote was
invisible to the exit for 20 s, so the position showed less than CLOSE pays, or nothing. In the exit tail (D-204),
that was most of a placement's life. The IOC limit still bounds what a taker gets. This applies D-197's "read with
`minRestSec = 0`" and extends it to the buy side for the same reason. The order lane's book read no longer waits on
the Series facts.

### D-206 — the house centres on the display carried by its measured basis (S23, S24.4, 2026-10-08)

**Finding:** I compared 26 minutes of RedStone's signed values on Moderato with the display feed at the same second
(`/prices/history` against `/prices/recent`, ~130 prints a feed, 2026-10-08 17:27–17:53Z):

| feed | basis | residual p50 / p90 | the signed value's 10 s move, p50 / p90 |
|---|---|---|---|
| BTC | 0.68 ± 1.85 bps | 1.25 / 3.04 | 2.09 / 5.26 |
| ETH | 0.40 ± 1.90 bps | 1.29 / 3.18 | 2.67 / 6.02 |
| SOL | 0.64 ± 2.81 bps | 2.00 / 4.36 | 4.69 / 12.19 |
| TSLA | 0.30 ± 0.72 bps | 0.30 / 1.15 | 1.23 / 4.30 |
| NVDA | 0.33 ± 0.87 bps | 0.49 / 1.41 | 3.26 / 7.36 |

The guard's envelope (D-196, F-S23-01) keeps the pair uncrossable at both the signed fair and the display fair. That
means paying for the signed value's staleness. Near the line on a 5m Window, where 1 bp is ~30–37 ticks, it left 28¢
spreads: the terminal's trade bought at 36¢ and could sell at 8¢ (acceptance S23, run 37815563808).

**Decision:** once a signed feed has a measured basis (≥ 12 prints), the seed maker centres on
`display × e^basis`, the best estimate of what that feed reads now. It widens the normal half spread only by what the
estimate can be off by: the display quote's own age (σ√age) plus the basis's standard error, never under 0.5 bp. The
pull rule still comes first (feeds disagreeing past 6σ√lag and 25 bps means one is wrong), and the envelope stays the
rule until a feed has its basis. Settlement is unchanged: Windows settle on RedStone's signed prints only.
**Supersedes** D-196's "the display price is a risk signal only" for the maker's centre.

### D-207 — owner answer (2026-10-08): no UI test suites; tests only to be confident

"Tests are not part of the deliverables… I don't expect you to be writing tests for UI… only for some, just to check
how it works." **Tests are written where they give confidence that functionality works** (logic, money paths,
contracts, encoders, a maker's pricing rule), next to that logic. A real flow is confirmed with one live check on
Moderato. Browser e2e drivers are not ported or extended as work of their own. **Supersedes** the S23 gate's "e2e
drivers rewritten (first-call, parlay, private, …)". The drivers already ported (terminal-trade, tap-latency,
onboarding, trading-balance, boost, range) stay as the gate's live checks; the rest stay as they are.

### D-208 — a requote means a dearer book, not a larger escrow (S23d, 2026-10-08)

**A tap is a requote only when the book got dearer: the stake now buys fewer contracts, or the protective limit is
higher in the side's own terms.** A cheaper or equal book keeps the confirmed contracts (the payout the button showed)
at the fresh limit, so the escrow stays within the confirmed `maxCostBase` and the fills cost what the book asks now
(`engine/quote.ts` `holdToConfirmed`, used by `freshQuote` for the wallet and Trading Balance lanes). The old rule
compared escrows, and at a fixed stake a cheaper book buys more lots whose escrow can round above the confirmed one:
the v2 Trading Balance check (CI run 37834989176) got "Price moved — the book moved to 60.1¢" on a button that said
60.6¢. **Refines** the cap contract in `ports/submitter.ts` (the confirmed escrow is still never exceeded).

### D-209 — an exit trigger is the owner's session key's signature; the keeper only decides when (S24.3, 2026-10-08)

**A Trail / TP / SL that runs with the app closed is stored only as an EIP-712 message signed by the actor of the
owner's live SESSION grant on the current Trading Balance** (`@cwf/core/exits`, domain = chain + `EventVaultV2`), so a
trigger needs no extra prompt (the session key already signs every tap) and each sale is traceable to the owner's own
key. `/api/exits` reads the grant on chain (owner, kind, not revoked, not expired) and checks the signature against its
actor with Tempo's `verifyHash` — the session key is the browser's WebCrypto P-256 key, so its signature is a Tempo
envelope that ecrecover can't read — and
stores one trigger per position (vault, owner, Window, side) — a larger nonce replaces it, an empty one cancels, nothing
replaces it while the keeper is selling. The keeper moves a trail's stop only in the position's favour and sells only
through the owner's EXIT grant with `exitFor` (never `placeFor`, which the EXIT grant refuses), at the vault's floor
rounded up onto the tick grid. A stolen session key could at worst set triggers that sell at the floor — the owner's
stated tolerance under fair value — which is the same bound the EXIT grant already accepts. Reads (`GET`) need the
owner's server session. **Implements** D-193's "triggers written through `/api/exits`".

### D-210 — RedStone through authenticated gateways; the container checks liveness, not readiness (2026-10-08)

**RedStone's public gateways are being switched off** (their answer, `public_gateway_rejected`): since 2026-10-08 they
refuse requests in scheduled windows that grow daily until 2026-10-29, when they stop; "No API key works on these
hosts". The replacement is an authenticated gateway — a URL and an API key RedStone issues (two pairs, for failover),
sent as `x-api-key`, at most one request a second per key; a browser must go through its own server's proxy. Every
RedStone read now goes through one module (`@cwf/markets` `prices/redstone-gateways.ts`): `REDSTONE_GATEWAYS` (secret,
ops and web) else the public pair; one request a second per key in a process; one "latest" answer shared for a second
across the spot feed, the keepers, the calendar and the web proxy (`/api/prices/redstone-payload`, which already is that
proxy); a key never reaches a log, `/health` or an error. The packages, signers and data service are unchanged.
**Liveness vs readiness:** a RedStone window made the spot feed (critical) fail `/health`, Coolify's container check
read the 503, marked ops unhealthy and the proxy dropped the whole API (stream, prices, `/session`). The container check
moves to `/livez` (the process serves); `/health` stays the strict view for monitoring. **After the window**, the ops
host stayed refused by RedStone's CDN (CloudFront "Request blocked", while another host read the gateway again): a
refusing gateway is now rested in-process — a minute, doubling to ten, reset by the first answer — so a refusal stops
the whole process asking. Owner action: the key request.

### D-211 — one stream ticket secret, and a refused ticket never closes the public stream (2026-10-09)

**Every signed-in page had no live stream since the ticket was introduced:** the web minted `user:` tickets with one
`STREAM_TICKET_SECRET` and ops verified them with another (two unrelated 64/66-character values in Coolify), so ops
answered 401 and the client retried the same refusal with backoff forever — no ticks on the chart ("Reconnecting…"),
no market or `user:` events (the keeper's "hit" toast included). Signed out, the stream worked. Fixed on testnet: the
web's secret now equals ops's (copied app to app, never shown; web restarted) — `env-matrix.md` already required one
value. **And the client degrades:** a 401 to a ticketed connect rests the per-user topic for a minute and reconnects
at once with the public topics (`USER_REST_MS`), telling the caller (`onUserGrant(false)`), so a secret out of step
can cost user events, never prices.

### D-212 — a WebSocket never stalls a request; the wallet signs over HTTP (2026-10-09)

**A root write on a freshly loaded page hung with no prompt and no request** (Stop on the EXIT grant in Settings, five
CI runs): the wallet's transport put a WebSocket first in viem's `fallback`, the socket stuck opening, and a socket that
never opens never errors — viem's timeout covers the request, not the connect — so the fallback never reached HTTP
(captured: one `wss://` open, no frame in 120 s). The wallet's client signs and sends and subscribes to nothing, so it
now uses HTTP only, like the session and wallet keys. The read runtime keeps its socket for logs and heads, wrapped so
every request (the connect included) gives up after 8 s and the fallback takes HTTP (`bounded`, `SOCKET_GIVE_UP_MS`).

### D-213 — owner answer to Q-033 (2026-10-09): the EXIT floor takes an absolute slack

**A keeper sale's floor is the side's fair value less the wider of the grant's tolerance share and an absolute slack**,
`fair − max(toleranceBps × fair, slackBps × $1)`, never under 0 (Q-033 option (c), recommended in F-S24-01, answered
"yes" by the owner). Why: 15 % of a cheap side is a few ticks (6.2¢ on a 41¢ Down), inside the house's half spread
once it is widened (3¢ base, doubled in the tail, plus the divergence guard's gap between the display and signed
fairs: 6.4¢ in run 37920856259), and a stop-loss fires exactly when the display leads the signed fair down, so it
waited under the floor until the Window ended. The slack fixes that without loosening the house's own protection
against latency pick-off (option (d) would have).
- Per grant, like the tolerance, stated by the owner when granting and recorded in `ExitGranted`; the contract caps
  it at 15¢ (`MAX_EXIT_SLACK_BPS`, the house's widest fixed half spread, its quote across RedStone's daily gap). The
  app grants 15 % or 10¢ (`EXIT_SLACK_BPS`); a later change of default needs no redeploy.
- What it costs the owner: the most a keeper sale can give up per token is now max(15 % of fair, 10¢) rather than
  15 % of fair; on a side worth under 10¢ that is all of it. That is the bound the drawer and Grants state.
- EventVaultV2 is not upgradeable, so it is redeployed on Moderato; the old address moves to the fragment's
  `history[]`. Every place that lists vaults now reads that history (`deploymentsWithHistory`): the app's previous
  balances (one card per previous vault), the indexer's followers, the settler's cranks, and the v2 relay policy's
  targets (withdraw, revoke and crank stay sponsored there). The old `ExitGranted` shape still decodes; index/0005
  adds `exit_slack_bps`. Owners re-arm on the new vault, as at the v1 → v2 move.

### D-214 — the docs live in the site group at /docs, beside /privacy and /terms (decision, S20, 2026-10-10)

**The documentation (L-20) is a section of the web app at `/docs`, in the site route group, not a separate site.**
The parity row said "new docs repo"; three facts made one app the better shape. (1) S20's own row has `/privacy` and
`/terms` reuse the docs layout, so that layout is in the web app either way. (2) "Only shipped surfaces" (L-20) holds
best when the docs deploy with what they describe — the contracts page reads the same generated deployments the app
calls, so it can't drift. (3) `docs.mitoshi.xyz` had no DNS record and the footer's Docs link was dead; `/docs`
works on the deployed host the moment it ships. `NEXT_PUBLIC_DOCS_URL` still points the nav and footer at another
site, with `/docs` redirecting there, if a separate docs host is wanted later. The layout's sidebar is 21st 19371
(uiable/sidebar-1), opening from the right edge on phones (D-190).

### D-215 — /stats counts wallets, never the house; in the site group (decision, S5, 2026-10-10)

**`/stats` (L-15) counts a wallet when it took a side on a Window, read from the index's fills over all time** (the 24 h
cap in Masayume was DreamDEX's paging limit; our index has none). Three rules decide whom a fill counts for, proven on
live data (1,437 fills: 975 were the house against itself) and in `traction.test.ts`:
- **The house is never demand.** `HOUSE_TRADERS` (`@cwf/core`: the keeper/house taker, seed maker, earn quoter and desk
  keys from S0.10) and the maker vault are left out; a fill with the house on both sides is not a call and is shown
  apart ("House fills"). Mainnet's role keys join that list at S19.
- **A Trading Balance tap counts for its owner**: a vault side resolves to the owner `idx_vault_executions` records in
  the same tx and Window (every vault fill on testnet has one).
- **A product contract (Boost, Parlay, Range, the private desk) is a call with no name**: counted as a call, reported as
  unattributed, never guessed, until those products are indexed by owner.
A maker side's kind and price follow the fill's path (direct: the opposite buy/sell of the same outcome at the same
price; mint/burn: the same buy/sell of the other outcome at the complement). The page says plainly that testnet wallets
include our own end-to-end runs' fresh passkey accounts. **It lives in the site group** with `/status` and `/proof`, so
it carries no wallet stack (S5 gate: site-owned 23.6 KB of 35); a failed read is never cached (the cached function
throws; the caller shows no numbers), which also fixes the landing's figures.

### D-216 — S5's "no wallet stack" gate line, read per route group (decision, S5, 2026-10-10)

**The S5 gate's "these routes carry no wallet stack (budget ≤ 120 KB)" is checked as: nothing of the wallet runtime
is in any S5 route's first load; the KB figure is the route group's §3.1 budget as amended by D-071.** The 120 KB
figure predates D-071 (the framework floor alone is 128 KB gzip), so the public read-only routes (`/stats`,
`/status`, `/news`, `/proof/[market]`) are gated on site-owned JS ≤ 35 KB. `/leaderboard`, `/u/[address]` and
`/portfolio/edge` stay in the app group (≤ 250 KB): they open from the terminal's account drawer inside the app shell,
the board highlights the asker's own row, and Trader Edge is the signed-in wallet's report. They still carry no wallet
stack on first load — `WalletShellProvider` mounts `WalletRuntime` (wagmi, viem/tempo, the passkey connector,
WalletConnect) as a lazy island that loads only for a wallet to restore or on the visitor's first interaction (D-152);
the first-load chunks hold that cookie check and the chain id, nothing else of the wallet.

### D-217 — the weekend Gap on Data Streams with a RedStone check, on mainnet (decision, S6, 2026-10-10)

**Where `venue-spec.json` `dataStreams.gapChains` names the chain (Tempo mainnet, 4217), a Gap Series' version 0 is
Data Streams primary on the ticker's RegularHours v11 stream with RedStone as the check source; on Moderato it stays
RedStone primary with the print archive (Q-011, D-035).** G-03 prefers Data Streams for the Gap because Friday's close
report can still be fetched and verified on Monday, where RedStone's gateway keeps about 24 h. `GapPolicy.dataStreamsPrimary`
(contracts/script/lib) builds it and `EngineCheck.seriesPolicy` picks it per Series (`RegisterSeries`):
- **Primary:** the stream from `dataStreams.feeds` (the same IDs the relay proves with, `DATA_STREAMS_FEEDS`; a test keeps
  them equal), grace 5 s, the open admitted until the lock (`ADMIT_UNTIL_LOCK`, the Gap's own rule), the close inside
  `redstone.admissionSec`.
- **Status mask 2 Open | 5 Closed**, 0 Unknown refused: a report just after Friday's 16:00 close reads Closed, Monday's
  09:30:00 print Open. These boundary statuses are **unconfirmed** until a credentialed report exists (owner, Q-011): the
  first mainnet Gap is checked against it before the Series is registered (S19).
- **Check:** RedStone on the ticker's feed inside `check.admissionSec` (120 s) at 25 bp, `check.redstoneStrictSec` 60 s
  (all five signers until then, three after) — the engine requires a RedStone check's strictness inside its window, so
  the primary's 300 s can't be reused. The relay records it ~10 s after T; one missed settles single-source, never a void.
- Open for mainnet (S19): halt-watch passes an empty Data Streams input today, so `datastreams-stale` /
  `datastreams-closed` are never observed; it reads the streams once the credentials exist.
Proven in `contracts/test/engine/GapDataStreams.t.sol` (the engine accepts it on a Gap, refuses it elsewhere, refuses a
check strictness outside its window; the real spec picks it on 4217 only).

### D-218 — S9's open choices, defaulted (decision, S9, 2026-10-11)

The S9 survey left ten questions; each takes the default that matches what is built, recorded so the owner can
overturn any:
1. The StrategyRegistry binds to **EventVaultV2** (the Trading Balance users hold today); `vault` stays immutable.
2. **Copy is self-paid**: the one-transaction batch carries `grant`, which the relay never sponsors (D-156), so the
   copier pays its fee and the copy drawer says so. Stop (revoke + unsubscribe) stays sponsored as an exit.
3. Per-subscriber **`maxFee`** is the fee guard (`FeeAboveMax`); L-51's "D-112" was the reference repo's numbering.
4. **Testnet decisions are labelled "unpaid"**: the AI hosts charge on mainnet only and Q-020 is open; the receipt slot
   shows a real `mpp_receipts` row whenever one exists (mainnet after Q-020).
5. **Ranking keeps Q-001's inherited rule, labelled "inherited"**, and every row also shows P&L with its sample size
   ("12 settled"); the owner may switch the sort.
6. The **agent-rater** is its own key role (`agent-rater`, AG-15: the owner can't rate their own agent), dry-run by
   default; cadence: one pass a day over settled decisions until the owner sets another.
7. **ERC-8004 registration is the creator's choice at publish** (a sponsored `register`), its id passed as `agentId`.
8. **Envelope market scope** is one series id or "any"; `subscribe` refuses a grant whose `Caps.market` is outside it.
9. **Mirror** (A-3b) is a spec preset (`mirror`, the source address as a parameter): data, so the registry is unchanged.
10. **SeasonPrizePool stays in S12b** (its tests are listed there).

**Why:** none blocks building; each matches the code already on chain or the decisions it cites.

### D-219 — the registry's market scope, the copy batch and the fee, as built (decision, S9, 2026-10-11)

What S9.1 settled while building D-218.8 and L-53 into `StrategyRegistry` (Moderato `0x7915…B8FD`):
1. **Series scope is the runner's to hold.** EventVaultV2 pins a grant to one Window or any Window (D-091); it cannot
   pin one to a series. So a series-scoped strategy accepts an any-Window grant or a Window of its series, and refuses
   a Window of another series (`OutsideEnvelopeMarket`: a grant its runner could never use). The runner asks
   `inScope(id, market)` before each order; the copy drawer says the agent trades only that series.
2. **`subscribe(id, 0, …)` reads the caller's active STRATEGY grant**, so copy is one batch (`grant` + `approve` +
   `subscribe`) though a batch can't pass one call's result to the next. The vault keeps one live STRATEGY grant per
   owner, so a copier follows one runner at a time.
3. **The fee is paid when a subscription starts**, not on each `subscribe`: moving onto a new grant or switching
   follow ↔ fade while subscribed is free (`maxFee` 0 passes).
4. **Metadata is `bytes`** (UTF-8 JSON from the app), at most 8 KB; publishing without metadata needs no root key.
5. The deployment area is **`strategies`** (the name `AREAS` and `RelayArea` already used).

**Why:** each is what the deployed vault and Tempo's batch rules allow, without changing the vault users hold.

### D-220 — the house strategies' triggers sized from the measured regime (decision, S9, 2026-10-11)

The house runner, live on testnet, reported BTC "closest trigger 19–20 bps away" for hours. The index's own prints
said why: over 24 h (280 Windows each) BTC 5m Windows moved 1.65 bps open→close at the median (p75 3.42, p90 4.97, max
14.49) and ETH 2.85 (p75 5.03, p90 7.50, max 36.38), so triggers of 20 and 30 bps never fire. House #1 momentum now
triggers at 3 bps and #2 reversion at 5 bps (≈ p75 of a whole Window's move; fewer fire mid-Window), their words with
them — an on-chain `update` (spec revision; the envelope copiers agreed to is unchanged). A creator's own strategy keeps
whatever trigger its creator sets; the builder says what its trigger means in percent.

**Why:** a house strategy that never acts tells a copier nothing; the threshold should fit the market it trades.

### D-221 — any one model key switches the brain on; OpenAI's default is `gpt-6-sol` (owner, S9/S13, 2026-10-11)

The owner asked for the agents to run on an OpenAI key too, model-agnostic as in Agari. The resolver already took any
`creator/model` (Masayume's design, ported); what it lacked was a default per key: with `AI_MODEL` unset it named Claude
and ignored an OpenAI key. Now `AI_MODEL` wins when set; otherwise the first provider whose key is set answers with its
default — `ANTHROPIC_API_KEY` → `anthropic/claude-opus-5-5`, `OPENAI_API_KEY` → `openai/gpt-6-sol` — and the hold
message names both keys. An MPP route's model is never chosen by a key on the box. Sensei takes the same default
(`SENSEI_MODEL` still overrides).

The OpenAI default was measured, not picked from a price list: house #3's prompt on one fixed Window, three reads each
through the brain's own `decideAgentWindow` (strict structured output accepted by all four):
`gpt-5-nano` (Agari's) median 4.9 s, held at 0.40 every time and once cited "several losses" from an empty record;
`gpt-6-luna` 3.2 s, up 0.76; `gpt-6-sol` 3.1 s, up 0.77–0.78 with reasons tied to the figures ("UP at 58 cents, below
the chase threshold … 2:30 remains"); `gpt-6.1-sol` 4.5 s, up 0.76. Testnet runs on the owner's OpenAI key (the one
Agari uses), copied app to app on Coolify, never shown.

**Why:** the brain should switch on with whichever key the owner holds; a model whose stated reason contradicts its own
inputs would show that error on the public agent page.

### D-222 — Owarine is the UX baseline for markets, terminal, portfolio, sign-in, games and phone (owner, 2026-10-12)

After reviewing the deployed UI the owner made Owarine (`90a91d71`, the owner's own Masayume port) the reference:
logos on every asset, honest 24/7 vs session labels, the /markets hero with its chart and ticket, the terminal's
positions panel and settings sheet, the sign-in picker, the rail balance tile, portfolio, stocks and games. Two
choices, both the owner's: Mitoshi keeps its brand (vermilion, its fonts, dark default) and takes Owarine's surface
treatments; on phones overlays become bottom sheets as on Owarine, **superseding the 2026-09-04 "no bottom sheets"
rule** (desktop keeps right drawers and centred modals). Ledger: `owarine-parity.md`.

**Why:** the owner: "you don't have to be mediocre… you have a lot of inspiration to take from".

### D-223 — DEMO mode as on Owarine; Owarine's word counts (owner, 2026-10-12)

Signed out, Mitoshi runs in DEMO as Owarine does: paper dollars kept in the browser, calls on the live Windows at the
live price, settled on the real signed close, every surface labelled DEMO; "Create account" moves to live money.
**Supersedes D-191 ("no paper positions") and the revamp's "no simulated balance".** Copy follows Owarine's density:
no hints, explainers or stage codes on screen ("too much text… a sign of slop"). Plan: owarine-parity.md P0–P6.

### D-224 — Round 2 of Owarine parity: one frame in, one account surface, Owarine's counts (owner, 2026-10-12)

The owner restated the brief after P4 (text, the way in, the portfolio). Plan: `owarine-plan-r2-2026-10-12.md` (R1, P5,
P6). R1: every rendered string over ~60 characters cut to Owarine's length and the dead copy deleted (the old sign-in
strings, `EXPLAINERS`, the session banner); "Create account" closes the modal on the passkey and the shell funds the
new account (`FirstFund` → `CreditWelcome`), so the onboarding step and `Onboarding.tsx` are gone; the account popover
is Owarine's `SeatAccountMenu` (marble avatar, address with copy, the two balances, Portfolio · Account & keys · Sign
out) and the second `AccountModal` is deleted; capability pages carry no stage codes. **R1b (the owner's clip, "move
wallet connect to the end — connecting a wallet is a signing step, not a login step"):** signed out, the ticket
composes as if signed in and its one CTA is the order ("Buy UP for $5.00"); tapping it opens sign-in titled for that
order (`session.connectFor`, the shell's `pickerIntent`) and the side and stake survive it; no sign-in wall before
value. P5: `/stocks` tiles and the ticker hub on real data (spot stream, session store, Finnhub, the lane cards, the
Mirror token). P6: under 768 px every drawer and modal is Owarine's bottom sheet; the top line is mark · mode chip ·
balance · account; Everything carries the places grid and the theme.

### D-225 — `/earn` is Owarine's four-tab reserve page on the deployed contracts; realized from events; Settle on the engine's word (decision, S8, 2026-10-12)

1. **Four tabs, one page.** The maker vault and the range, parlay and boost reserves expose the same `supply` /
   `withdraw` / `sharesOf` surface on chain, so `/earn` is Owarine 90a91d71's `EarnScreen`: one hero, the live panel
   (share price, delta above par, value, utilization), supply and position cards, then the vault's Windows or the
   reserve's own bounds. The reads share the Range, Parlay and Boost features' query keys, so a supply here refreshes
   their tickets too.
2. **Realized and on-paper come from the reserve's own events.** No reserve keeps per-supplier totals, so the ledger
   folds `Supplied` / `SupplyRedeemed` for the wallet from the reserve's deploy block (≤ 100k-block windows, six at a
   time), read once per five minutes and after each write. Realized = paid back above cost; on paper = today's worth
   less the cost still in — never a rate (A-2c).
3. **Settle only once the engine has its print.** The vault refuses a withdraw from a Window's expiry
   (`unsettledExpired`), but its `settle` reverts until the engine resolved or voided the Window (status 4/5, the
   earn-quoter's own rule). The table shows "closed · print pending" meanwhile and the withdraw waits up to 90 s for the
   settler before saying so.
4. **Sponsorship as D-118:** `supply` is self-paid (`[approve, supply]`, one passkey prompt); `withdraw`, `merge`,
   `settle` and `pull` ride the relay's `maker` policy, now typed and listed in `POLICIES` (it was written in S8 but
   never registered, so the deployed relay refused the maker area until this slice deployed).

**Why:** the owner's brief for round 2 (D-224) applies to every surface: Owarine's component and words, real data, no
invented yield.

### D-226 — Round 3: no Stocks section, Markets is every market, every width works (owner, 2026-10-12)

The owner, after round 2: still mediocre; not responsive; "why a /stocks section… market is beyond stocks, we also
have BTC"; Line Rider can't be played; loading states, Sensei, /earn's "Where the capital is" and News fall short; read
Owarine's code, not screenshots; use 21st.dev for parts; fix what he didn't name too. Plan:
`owarine-plan-r3-2026-10-12.md` (slices A–I).

1. **No Stocks place.** Owarine's places (Trade · Markets · Portfolio · Games · Automate · Leaderboard). `/stocks` →
   `/markets`; the stock hub is `/tickers/[symbol]` (Owarine's route), reached from cashtags, cards and the hero.
2. **24/7 lanes carry crypto and 24/7 stocks together**, crypto first; the default lane is `5m · 24/7` and the hero
   defaults to BTC. Regular-session lanes stay their own (`5m`, `15m`, `1h`, `Gap`).
3. **Every app page except `/` and `/pitch` renders in the app shell** (Owarine's `ShellChrome` rule).
4. **One breakpoint set** (640/768/1024/1280) and Owarine's in-stage rules (`html[data-shell]`); each slice is checked
   at 320 · 375 · 768 · 1024 · 1440 in both themes with an overflow sweep.
5. **Game sounds ship as files** (Owarine's CC0 Kenney set); the terminal's cues stay synthesised.
6. **The arcade board is real:** replay-checked scores in Mitoshi's Postgres, as Owarine's `score.server.ts`.

**Why:** the owner's words of 2026-10-12, and the audit that found the causes (plan file, Context table).

### D-227 — Round 4: product fidelity, correct P&L, creative games (owner, 2026-10-12)

The owner after round 3: only the terminal and the leaderboard are good; port Owarine's product from its code (Senryo,
`~/dev/hackathon/metropolis`, for the games' new direction); the P&L is wrong; never make him scroll to the action;
fewer words; ultracode on. Plan: `owarine-plan-r4-2026-10-12.md` (slices R4-0…R4-13), work orders from a 15-agent
source study (one spec per surface).

1. **Every `:has()` frame rule matches only a visible surface** (`cacheComponents` keeps hidden route DOM).
2. **The phone dock stays under the terminal** (Owarine), the chart chips sit above the settings stack.
3. **One cost basis rule:** a position's P&L is what Close pays now (or the known payout once resolved, or its cost
   while locked) less the open cost of what is held; sales lower the open cost pro rata.
4. **One kit** (`components/kit`) before any surface port.
5. **Trade from X (S11, 2026-10-13)** is Owarine's rail on Mitoshi's account: the X session signs who is on X; the
   account's passkey or wallet signs the link (Tempo's verifier, network named); a mention trades only through the
   account's EXECUTOR grant (`xGrantCaps`: the budget is the boundary, 8 open Windows, 30 days) from the relay's own
   key, once per post id. The relay reads the bot's session first (free) and the X API second (credits); it is dry
   until `X_RELAY_LIVE=1` and speaks on X only live with `X_POSTING_ENABLED=1`; a reply carries Owarine's receipt card
   (ported from Owarine 90a91d71:services/ops/src/actors/x-relay/reply-card.ts, Mitoshi's brand) drawn from the same
   facts as its text, and falls back to the text alone. Share links (A-3e) open the terminal with the call set and
   place nothing. A call is for the Window trading when it was posted: read more than one cadence late it is refused
   (`call-expired`), a repost is never a call, and a send left unknown holds every later mention until the chain
   settles it (S11 review).

### D-228 — one address: `mitoshi.xyz`, and no "testnet" in the name (owner, 2026-10-13)

The owner: the `testnet.` host was a discouragement, and DEMO already says "practice"; just change the domain. Supersedes
D-060's layout.

1. **Hosts:** the app at `https://mitoshi.xyz` (`www.` redirects to it), ops at `ops.mitoshi.xyz`, the stream at
   `stream.mitoshi.xyz`, the guides at `docs.mitoshi.xyz`. Until mainnet (S19) they serve the Moderato build; at S19
   the same hosts move to the mainnet apps.
2. **Retired names** (`testnet.`, `ops.testnet.`, `stream.testnet.`, `docs.testnet.`) stay attached only to redirect:
   301 (308 for a write) to the same path and query on the current name — `web/src/lib/canonical-host.ts` (from
   `APP_ORIGIN` and `PASSKEY_RP_ID`; a 307 while `APP_ORIGIN` still names another host, so no browser caches the apex
   pointing away), `movedHost` in `@cwf/core` for ops (a CORS preflight is answered, never redirected),
   `docs-site/next.config.mjs`. `/.well-known/*` answers 200 on every web host (static files — `*.json`, images — are
   outside the proxy and answer on every host too), and the phone app links both the apex and the old host. Ops' default
   CORS list on testnet keeps the old web origin, so a tab opened before the move keeps its prices and stream.
3. **Unchanged:** the chain (Moderato), `NETWORK=testnet`, chain ids, the Coolify `testnet` environment and resource
   names, the passkey rpId `mitoshi.xyz` (every passkey keeps working), the bundle id, package and EAS slug.
4. **Words:** "testnet" is not branding — page titles, metadata, the landing, share cards, link previews, the docs'
   name and the app's store name ("Mitoshi", version 1.0.1) drop it. The app names its network in one place: the
   R4-8 mode plate at the rail's head (`ModePlate`; its stamp on the icon rail, its chip beside the mark on a phone —
   one indicator, one width at a time) — 練 DEMO signed out, 試 TESTNET · Test dollars signed in. The account chip, the
   sign-in sheet's passkey group and the health chip say "Tempo"; the site header's TESTNET pill is gone. Money stays
   honest where it moves: Add money's "Test dollars" with "No cash value", "Test dollars · no cash value" on the X
   pages, "Test money" on automation, the terms, the in-app testnet notes and the guides. An X receipt card still names
   its chain (Tempo Moderato testnet).
5. **Returning users** sign in again on the new origin with the same passkey: the session cookie, one-tap keys and
   DEMO's paper balance belong to the old origin.

### D-231 — the bridge is removed; stocks are Windows; themes become baskets on stock Windows (owner, 2026-10-13)

The owner, after the round-6 live review: the Robinhood ↔ Base Sepolia ↔ Tempo bridge leaves the product. It never
worked end to end — the Robinhood side was never deployed (it waited on test ETH since S14c), LayerZero testnet delivery
took from 23 s to 7.7 days, and the owner doesn't want it. The plan and its live evidence:
`r4-specs/bridge-removal-map.json` (`result.plan`, 18 steps). Owner rule: every visible feature works end to end, names
its network where chains appear and uses real logos — or it is removed.

1. **Removed from the app:** `/bridge`, `/reserves` (Backing) and their API routes (`/api/bridge`, `/api/bridge/<guid>`,
   `/api/reserves`, `/api/index/stocks/events`); the More and ⌘K entries; Portfolio's In-flight section; the ticker
   hub's Bridge and Reserves links; Add money's "Bring stock tokens from Robinhood" rail; the side-chain wallet (the
   Robinhood Chain row in the account menu and Account & keys, the sign-in modal's link mode — wagmi's chains are
   `[Tempo]` only); the multi-leg `settled` tx state; NFLX in the terminal's paused list (it was listed only as a bridge
   ticker, D-107). Old links answer 308: `/bridge?t=<TSLA|AMZN|PLTR|AMD>` → `/tickers/<SYM>`, `/bridge` and `/reserves`
   → `/markets` (removed, not moved: no `?note=moved`).
2. **Removed from packages and ops:** `@cwf/core` `bridge`, `@cwf/markets/stocks` (and its `stocks/topology`,
   `stocks-ops` exports), the `stocks` relay policy and `encodeBridgeIntent`, the side-chain exports, the Robinhood,
   Base and LayerZero explorers and pinned constants; `@cwf/db`'s bridge and reserve stores (drop migrations
   `bridge/0002`, `index/0008`; `0001_bridge.sql` and `0007_bridge_events.sql` stay — the log is append-only); the ops
   actors **bridge-watch**, **reserve-watch** and **stock-sync**, the indexer's five `bridge <T>` followers, the
   `stock-sync` role key and the `RH_RPC_HTTP_URL` / `BASE_SEPOLIA_RPC_HTTP_URL` env.
3. **Contracts stay on chain, out of the app:** the Base Sepolia hop (84532), both LzPing probes and the five
   TIP20MintBurnAdapter proxies move to `contracts/deployments/retired/` (codegen, invariants and the docs sync read only
   numeric chain directories); their Solidity, scripts and tests, the `evm` Foundry profile and the side-chain RPC
   endpoints go. Nothing is stranded: `totalDeferred` and `mintedNet` were 0 on every adapter and the Base contracts held
   0 ETH. The Robinhood side (StockLockbox, StockSyncSender) was never deployed.
4. **What stocks are now:** nine US stocks (AAPL, AMD, AMZN, GOOGL, META, MSFT, NVDA, PLTR, TSLA) as UP/DOWN Windows of
   5, 15 and 60 minutes in NYSE hours, the same lanes 24/7 for seven of them on RedStone's `<T>---24_7` feeds (not AMD or
   PLTR; the feeds pause around 04:00 ET), and the weekend Gap — each opened and settled on RedStone's signed print. The
   chart's live line (Alpaca's IEX trades) settles nothing. No share or token changes hands. The claim is "stock markets
   on Tempo", never "stock tokens on Tempo".
5. **Themes stay, rebuilt** as `basket` strategies on the live StrategyRegistry that agent #82 trades as calls on their
   members' regular and 24/7 Windows (map option B; A — house-minted stock tokens — breaks the no-paper-backing rule, C
   cuts a feature the owner asked to revamp). The guarded v4 stock pools, the Mirrors, StockGuardHook/StockReference,
   ThemeRegistry/ThemeRouter, theme-agent and reference-writer retire with that rebuild (package themes-basket, plan
   steps 14–18); the house withdraws its ~$80k of bid-ladder positions (tokenIds 6–33) for maker depth.
6. **Ship order (ops throws `unknown actor` for any `OPS_ACTORS` name it lacks):** first remove `bridge-watch`,
   `reserve-watch` and `stock-sync` from the Coolify ops app's explicit `OPS_ACTORS` (27 names at the 2026-10-13 boot;
   24 after) and from `OPS_DRY_ACTORS` if listed there, restart ops on the current image, then deploy ops (it applies
   `bridge/0002` and `index/0008` at boot), web and the docs one at a time. `RH_RPC_HTTP_URL`,
   `BASE_SEPOLIA_RPC_HTTP_URL` and `STOCK_SYNC_PRIVATE_KEY` were never set on the Coolify apps (checked 2026-10-13).

Supersedes D-001 (stock-token source), D-020 (the bridge design) and D-080 (bridge gas); D-027 in part (the Robinhood
Chain wallet of the two-wallet model); D-040 in part (bridge-completion pushes); D-105 §4–5 (the StockSync pauses) and
D-107 (NFLX). Closes Q-009, Q-010 and Q-023, and the stock-token half of Q-008. The owner-actions rows for Robinhood
faucet claims, test ETH and the LayerZero pathway request are closed as not needed.

**Why:** a feature that can't run end to end is removed, not promised; the stocks pillar that is real today is the
Windows.

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
| Q-008 | Geofence; personal eligibility + budget for mainnet Stock Tokens (**the stock-token half closed 2026-10-13: D-231, no stock tokens**) | US browse-only (+ CA/UK/CH for stocks); no mainnet stock purchase until answered | S1, S19 |
| Q-009 | Testnet bridge route (**closed 2026-10-13: D-231, the bridge is removed**) | Base Sepolia hop + request the direct pathway | S14c |
| Q-010 | Robinhood pause → auto-pause the mirror (**closed 2026-10-13: D-231**) | Display only | S14c |
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
| Q-023 | Mirror naming (**closed 2026-10-13: D-231**) | "Bridged TSLA Stock Token (unofficial)" / `bTSLA`, own lettermark logo | S14c |
| Q-024 | StockGuard off-hours mode and bands | WIDEN (24/7 at pool price); 150/300/500 bps | S15b |
| Q-025 | Theme creator fee cap | 50 bps | S16c |
| Q-026 | ~~Hosting providers~~ answered by D-061 (Coolify) | Vercel, Fly, Neon, Upstash | S0 |
| Q-027 | App name, bundle IDs, URL scheme | `<reverse-domain>.app` (mainnet, later) / `<reverse-domain>.app.testnet`; scheme = the bundle ID; name from Q-019 + "Testnet" | SM1 |
| Q-028 | Geofence inside the testnet app for App Review (a US reviewer would see browse-only markets) | Same posture as the web, explained in the review notes with a reviewer walkthrough | SM5 |
| Q-029 | Convert the Apple account to an organization (legal entity + D-U-N-S, ~2–3 weeks) for a later public or unlisted listing and the mainnet build | Stay individual; TestFlight only | after S21 |
| Q-030 | Ask Colosseum whether judges install apps and whether judge emails can be shared for internal TestFlight | Ask now (agent drafts); public link + internal path both kept ready | SM5 |
| Q-031 | Wallet-mode access key defaults (D38): daily limit and expiry | Masayume's session defaults: $25/day, 24 h, renewable in one tap | S4 |
| Q-032 | Should arming one-tap add the Boost, Range and Parlay selectors to the wallet key (its scope is the engine only, D-138) | Those modes name the passkey prompt on the CTA | S23i |
| Q-033 | A keeper sale can't clear the EXIT floor (fair on RedStone's signed spot × (1 − tolerance)) when every bid sits under it. That happens on a cheap side, where 15 % is few ticks, in a fast move, when the house's spread is widened by the divergence guard. Stop-losses fire exactly there (F-S24-01). Choose: (a) keep it, since the floor is the promise and the drawer says why the keeper waits; (b) a 20 % default tolerance (the contract's maximum); (c) a VaultExits floor of fair − max(tolerance × fair, k ticks), a contract change under the money gate; (d) the house keeps its quotes inside the floor when its two fairs agree (latency pick-off when they don't). Recommended: (c). **Answered 2026-10-09: (c), D-213** | — | S24 |
