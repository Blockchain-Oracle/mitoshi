<!-- Copied from the approved build plan (v5, 2026-09-29). Change it only through D-entries in docs/plan/decisions.md. -->

# Build plan — the Tempo product (Crypto World's Fair, Tempo track) — v5

## 0. Context

The owner's plan: understand → fidelity → research → architecture → plan. Steps 1–4 are on disk (no code yet): ledger
`context/tempo/12-parity-ledger.md`, research `13`–`16`, architecture `17-architecture.md`, evidence
`context/tempo/fidelity/{masayume-side,agari-side}.md`. Earlier passes went to file level (Masayume's 34 contract files,
Agari's engine field by field, both apps' routes), produced three specs (Appendices A–C), took an adversarial review of
the stage order, and added the mobile app (Appendix D) on 2026-09-22.

**2026-09-29 re-plan (this version).** The owner asked for the plan to be redone from start to finish with **user
experience first**, UI built by **finding the right 21st.dev component and revamping it** (never inventing components),
**architecture for performance** built on each library's documented patterns (read through **Context7**), the mobile app
kept in full, and **tests written to prove functionality, not as a deliverable**. Five research passes were run and
saved in `context/tempo/research-2026-09-29/`:

| File | What it gives this plan |
|---|---|
| `ux-audit.md` | Every reference flow traced with file:line evidence: prompt counts, bugs, 390 px problems, perf problems, the patterns to keep exactly, what new surfaces need (§11), plan changes (§12) |
| `21st-map.md` | 262 components read; a pick per surface with revamp notes (Appendix E) |
| `web-stack.md` | Next 16, React 19.2, TanStack Query 5, wagmi 3/viem tempo, accounts SDK, lightweight-charts 5, motion, Tailwind 4/shadcn — recommended patterns and the decisions they force (§3, D41, D46) |
| `chain-libs.md` | Foundry, OZ 5, uniswap-hooks, v4, LayerZero V2, Solady — four plan corrections (D45) |
| `mobile-stack.md` | Expo 57, router, webview, notifications, widgets, EAS, Uniwind — 18 changes to Appendix D (D47) |

This plan builds **every contract, service and surface, in full** (D-113: sequencing, never cutting). Both pillars start
in wave 1. The appendices are the specs; S0 copies them to `docs/specs/` so they survive context resets.

## 1. Decisions

### 1.1 Owner answers — recorded as D-001…D-009 at S0

1. (2026-09-21) Stock-token source = **Robinhood Chain**.
2. Themes = **per-user accounts**: the user holds the mirror tokens; the theme agent trades through a Tempo access key;
   per-follower caps live in the ThemeRouter follow record (no separate KeyPolicy contract).
3. Trading Balance = **Masayume's EventVault ported as-is** (custody, SESSION/EXECUTOR/STRATEGY grants, caps in the
   vault, `crankSettle`, VaultTally). Only the ERC-2771 forwarder goes; our fee relay replaces it.
4. Build **in this repo**, pnpm monorepo in Masayume's shape.
5. (2026-09-22) **Mobile app on iOS + Android** (one Expo codebase; Android ships as a directly installable APK).
6. **iOS distribution = TestFlight:** a testnet build on a **public TestFlight link** (one Beta App Review) with
   **internal TestFlight** (no review) as the guaranteed path. Not unlisted (full review + separate request; Apple
   declines beta apps).
7. **Architecture = native shell + web screens:** native tab bar in Masayume's pill design, native passkeys, push,
   haptics, biometrics, Secure Enclave keys; product screens are the live web app; hot paths move to native.
8. **Apple account = individual.** Fine for TestFlight; a public/unlisted listing later needs an organization account.
9. (2026-09-29) **UI direction = keep Masayume's look, revamp the UX:** Masayume's identity (colours, type, nav, layout)
   and every flow stay; new surfaces (stocks, bridge, reserves, themes, launch, settings, mobile) are built from 21st.dev
   components restyled to Masayume's tokens, and ported screens with weak UX are rebuilt from 21st components too.

**Standing instructions (owner, 2026-09-29), applied to every stage:** UX matters "1,000%"; search 21st.dev for the right
component and revamp it — don't design components from imagination; "understand the libraries" means read their docs
through Context7 and follow the recommended patterns; architect for performance; tests are not a deliverable but are
written to prove important functionality works. **Owner overlay rule (Masayume ledger 2026-09-04, owner-directed):**
centred modals and the right-edge slide-over; **no bottom sheets** (OS share sheets excepted; ledger
`parity-ledger.md:47,65,69`).

### 1.2 Design decisions — recorded as D-010… at S0 (owner may overrule any)

| # | Decision | Why |
|---|---|---|
| D1 | **Engine = Agari's semantics in Solidity, policy-free.** One ERC-7201 storage layout; external libraries `MatchLib`, `AdminLib`, `ResolveLib` (delegatecall) + `EventsEngine` + a separate `EngineLens` reading via `extsload` | Fits EIP-170; no diamond (no upgradability, P7); no KeyPolicy hook (owner answer 3) |
| D2 | **Recycled global order-node pool** with FREED sentinels (never zeroed; reuse ~5k/slot), monotonic `seq`, uint128 handles `mIdx‖seq‖node`; **2-slot positions** (slot A is all a plain taker touches); per-holder order list threaded through nodes; `reserveNodes` pre-grows the pool | Tempo charges 250k gas per new slot; first order ≈ 350k cold → ≈ 110k with storage credits |
| D3 | **Native ABI shaped like `IDreamDex`; the seven Masayume seams are rewritten against it through an internal `EngineSeam` library — no façade contract** | A façade can't serve DreamDEX's per-market-address model, would double the ledger and hide the `PlaceResult` the accounting assert needs |
| D4 | **Units:** raw quantity = lots × lotBase (1000); priceRaw = ticks × tickBase (1000); `expireNs/1e9` → seconds at the seam; seams use **`lockAt`** for trading-time checks and **`expiry`** for settlement (they differ on Gap Windows) | Masayume assumes 1 raw outcome unit = 1 base unit of payout |
| D5 | **Every payout pre-checks the receive policy.** Engine `redeemFor` holds a blocked payout as credit; products use a shared `Payouts._payOrOwe` (owe + `claimOwed`) | Receive-policy blackhole strands funds; D-114 pattern |
| D6 | **Products opt out of third-party `redeemFor` cranks** (`setCrankOptOut`) | A crank would dump pooled payouts into the product and break per-owner attribution |
| D7 | **Verifiers are separate stateless contracts with immutable signer sets:** `RedStonePrintVerifier` (our port of Agari's parser; exact-T replaces RedStone's ±3 min default), `DataStreamsPrintVerifier` (v11 decode pinned from a real report), `AttestedPrintVerifier` (EIP-712); **`FairValueGuard`** for PD-2 | Admin cannot re-point listed Windows' prints; RedStone BUSL contracts avoided |
| D8 | **MakerGateway escrow becomes a measured delta;** every credit collection (incl. third-party sweeps) is booked | Our engine never refunds lazily into a placement |
| D9 | **Masayume's contract test suites run against the real engine** as the proof that each seam is correct (Book seeder replaces mock knobs); one `LyingEngine` fault-injection mock proves each product's accounting assert; golden vectors reused unchanged | Real integration; conversions are exact so vectors stay bit-identical; the suites prove the seams (tests are proof, not a deliverable) |
| D10 | **Strategy metadata via SSTORE2** (code bytes 1,000 gas/B vs slots ≈ 7,800 gas/B); **written only by the root key** (Tempo refuses any CREATE in an access-key tx, `spec-tempo-transaction.md:768`), never by the runner or an agent key | A 2 KB persona ≈ 2.6M gas instead of ≈ 16M |
| D11 | **Bridge:** immutable per-ticker `StockLockbox` (no proxy on the side holding real assets); adapter behind a proxy; `_credit` **never reverts** (defers: claim or resend) except the lockbox's outstanding-underflow guard; `StockSync` full-snapshot codec with `(srcTimestamp, seq)` ordering; one `ScaledUIView` per mirror | A revert inside `lzReceive` strands bridged funds; a forged over-release must stay stuck, not drain |
| D12 | **v4 on Moderato = replay 7 mainnet CREATE2 txs** (PoolManager, descriptor impl + proxy, PositionManager, V4Quoter, StateView, UR `0xa2dc`); WETH9 is not replayable (a V2 factory sits there on Moderato) — native paths never used; **pinned UR `0xa2dc…ea91`** on both networks | Address and runtime parity with mainnet |
| D13 | **StockGuardHook flags `0x20C0`** (beforeInitialize + beforeSwap + afterSwap), static fee, no return deltas; band from a `StockReference` store; **pool raw price = underlying × `uiMultiplier`** | A beforeSwap-only hook can't bound the post-swap price (the router passes extreme limits); still needs no routing allowlist |
| D14 | **ThemeRouter = `IUnlockCallback`**, settles each currency as `PM.sync(c)` → `transferFrom(follower, PM)` → `PM.settle()` (v4 docs), no Permit2/UR, recipient structurally `msg.sender`; per-(follower, theme) secp256k1 keys created and held by ops (AES-GCM; KMS-wrapped on mainnet) | Router/Permit2 recipients aren't bound by access keys; blast radius = one user |
| D15 | **Memecoin:** singleton `CurveLaunchpad` (concentrated-liquidity segment maths, v4-core `SqrtPriceMath`), pre-graduation compound TIP-403 policy blocks the PoolManager, permissionless `graduate()` into a hookless pool + `LiquidityLocker`, issuer and admin roles renounced after | Blocks pre-seeding the migration pool; fixed supply after graduation |
| D16 | **Stablecoin:** one 9-call creator batch (createToken, roles, mint, DEX pair, flip orders ≥ 100 tokens, FeeAMM liquidity, registry) + currency-code guard | Tempo-native; no launchpad custody |
| D17 | **Monorepo scope `@cwf/*`;** per-area deployment fragments `contracts/deployments/<chainId>/<area>.json` → codegen into `packages/clients`; invariant rules in `scripts/invariants` | Parallel agents without merge conflicts; ABIs can't drift |
| D18 | **Wallet:** wagmi 3 + Agari's RainbowKit replica re-pointed at `webAuthn`, `tempoWallet()`, injected; **two-wallet model** (a secp256k1 wallet on Robinhood Chain for bridge-in); injected wallets get a reduced capability set on Tempo (they can't sign 0x76 txs) | RainbowKit 2 needs wagmi 2; passkeys can't sign on Robinhood Chain |
| D19 | **Auth:** `Handler.webAuthn` + Upstash KV; one server verifier `packages/markets/src/auth/verify.ts` (viem Tempo `verifyHash`, authority = `SignatureVerifier` `eth_call`) | Passkey/P-256/keychain signatures everywhere Masayume used EIP-191 |
| D20 | **Relay:** `Handler.relay` built once at module scope (D46); `validate` reads per-request context (method, device, region) through AsyncLocalStorage; policy engine + per-area policy files in `packages/markets/src/relay/`; budgets debited only on raw-send methods in a Postgres ledger; EventVault sponsorship = unchanged from Masayume's list | `validate` runs twice; serverless counters don't hold; ops co-signs with the same policy |
| D21 | **Indexer:** own EVM log follower (per-address cursors, ≤ 100k-block windows, deterministic finality, `(marketId, seq)` gap rebuild) + Tempo Indexer API for recount/analytics | Works on both networks without keys; Agari's `idx_*` read model |
| D22 | **DB:** ordered migrations per area (`schema_migrations`) instead of an idempotent `CREATE` blob | Rows must change over time |
| D23 | **Ops:** one Fly machine per network, one HTTP server on 8080, every actor on `runActor` (vault maker too), DRY_RUN default | Single writer per key; health for all |
| D24 | **Brain:** `via:'mpp'` model routing + `mpp_receipts`; probe each MPP provider's intents first (session intent has no per-request receipt) | Receipts are the agent thesis |
| D25 | **Hosting:** Vercel ×2 (testnet, mainnet), Fly ×2, Neon Postgres ×2, Upstash Redis; one registrable domain as passkey rpId | Passkeys bind to the domain |
| D26 | **Archive takeover in S0:** an archive-only ops actor on Fly + import of Agari's laptop archive | RedStone keeps ~24 h; the Friday Gap print must never be lost |
| D27 | **Mobile = Expo SDK 57 app in `mobile/`** (move to SDK 58 when stable). **One persistent `react-native-webview`** hosts the live web app (one React instance, one wallet session, one query cache, one set of streams). A **native tab bar reproduces Masayume's floating pill nav** (not iOS system tabs, so the look stays; haptics on press) and a **right-edge "More" panel with a search row** (owner rule: no bottom sheets) and drives the web app's router over the bridge | Full parity and the exact design system on day one; several web views would run several copies of the app (duplicate sessions, streams and journals) and get killed under memory pressure; Masayume MIG00: "share domain/view models and reproduce the same flows", no second design system |
| D28 | **Account phase A:** the web app inside the web view keeps its `webAuthn` connector; the app carries `webcredentials:<domain>` (iOS) and Digital Asset Links `get_login_creds` (Android), so **the same passkey = the same Tempo account on web and app**. Android WebView in app mode reports origin `android:apk-key-hash:<hash>` → `Handler.webAuthn` origins gain it (the handler accepts an array) | Apple: WKWebView passkeys work for services configured as associated domains; Android: `WebSettingsCompat.setWebAuthenticationSupport(…FOR_APP)` routes through Play services FIDO2 with the app's origin; Tempo derives the address from the passkey key and skips origin/RP checks on chain |
| D29 | **Account phase B (sequenced after phase A):** native owns the account — native passkeys (`react-native-passkey` + a small custom accounts adapter, since the SDK's `webAuthn()` doesn't pass `createFn/getFn`), **hardware session keys** (Secure Enclave P-256 on iOS, StrongBox/Keystore P-256 on Android, via a local Expo module; `prehash: true`, DER→(r,s), low-s) used as the EventVault SESSION key, an **injected EIP-1193/EIP-6963 provider** into the web views, and a Face ID/biometric app lock | Hardware-backed tap-trading keys; the web replica modal already lists injected wallets |
| D30 | **Accounts SDK `mobileWebAuth` only for the "Tempo Wallet" option** (users who bring a wallet.tempo.xyz account), never for our own accounts | Its passkeys belong to `wallet.tempo.xyz` (a different account); a WKWebView can't use passkeys for a domain we don't own, so Tempo Wallet in the app must go through the system auth session this adapter opens |
| D31 | **Push = direct APNs (token .p8) + FCM** from a new ops `notifier` actor; devices registered at `/api/push/register`; pushes for verdicts, alerts, agent fills, theme rebalances, bridge completions, duel matches, X receipts | Background refresh on iOS is ≥ 15 min and often skipped — push is the only reliable channel |
| D32 | **Universal links / app links** for `/go/*`, `/markets/*`, `/stocks/*`, `/themes/*`, `/games/duel/*`, `/launch/*`, `/u/*`, `/native-auth` (AASA `applinks` + `assetlinks.json`); `/native-auth` becomes the real app handoff (X OAuth return via ASWebAuthenticationSession, Yosuku's pattern) | Reconstructs Yosuku's native app flows (L-19) |
| D33 | **Build variants:** `testnet` (Moderato only, no mainnet code path — guideline 2.3.1(a) forbids hidden features) for TestFlight and the APK; `mainnet` variant built later for an organization account; separate bundle IDs | App Review safety; mainnet listing needs an organization account |
| D34 | **App Review obligations built as product features (web too):** report / block / filter for rooms, takes, profiles, token and agent pages + published contact (1.2); in-app account deletion of off-chain data (5.1.1(v)); AI data-sharing consent for Sensei and agents (5.1.2(i)); privacy policy; 18+ age rating; export-compliance answers | Required for review; good practice for the web product |
| D35 | **UI = Masayume's look + revamped 21st.dev components** (owner answer 9). Every UI step names its 21st starting component (Appendix E). Revamp recipe: pull code with `21st get <id>` (or `21st add`), then map colours/spacing to Masayume tokens (the `design-literals` rule), strip gradients and glass, use Base UI primitives only (Masayume already does), `motion/react` as `m.*` under `LazyMotion`, lucide icons, `@number-flow/react` for live figures, Masayume's `numbers` utility (Plex Mono), add loading/empty/error/stale/blocked states, ≥ 44 px targets, ≥ 16 px inputs, keyboard + visible focus, reduced motion; record each adoption in `docs/design/components.md` (21st id, source, changes) | Proven components, one identity, no hand-invented UI |
| D36 | **Keep the references' state and copy grammar exactly:** the CTA names its blocker; every failure says whether money moved ("Nothing was taken"); ticket → The Call card → verdict stamp → cream receipt; "Returned" void card and "Paid automatically" (Agari); write journal + recovery toasts; the one-sentence tap-trading arm modal; named waits in duels; "Don't trust it. Click it." receipts; deep links that resolve to the next live Window | The references' strongest UX (ux-audit §10) |
| D37 | **One ceremony to a funded, tap-ready account:** passkey sign-up → server faucet funds with no user signature (testnet) → the tap-trading arm offered in the same centred modal → first call; the 5-step tutorial folds into contextual first-use explainers | Masayume needs 5–8 prompts cold → paid; target is 1 biometric, then 0 per tap (ux-audit fix 1) |
| D38 | **Two no-prompt trading paths:** (a) the Trading Balance session key (EventVault, D-003); (b) **wallet mode via a TIP-1011 access key** authorized in the sign-in ceremony (`webAuthn({ accessKey: { authorize: { expiry, limits: [pathUSD per day], scopes: engine place/cancel/redeem/withdrawCredit + pathUSD.approve(engine) } } })`); limits count `approve` amounts, so every tap is capped; the key is listed, spent and revocable in `/settings/account` | Taps from the wallet with no prompt and no deposit step; the accounts SDK's documented access-key pattern; X20 proves the limit accounting |
| D39 | **Verdicts pin to the user's own position** (not the hero selection); settler auto-pays (`redeemFor`) and leftovers claim in one sponsored batch; fix the references' ClaimWinnings false "Paid" and "Placing…" during claims; the stake is remembered after a fill | ux-audit fixes 2 and 4, bugs in §1–2 |
| D40 | **One real-time layer:** one SSE stream per client from ops (`stream.<domain>`, Fly; long-lived, not a Vercel function) carrying prices, fills, verdicts, room messages, takes and activity; chain WebSocket logs for the user's own events; both write into TanStack Query with `setQueryData`, batched per animation frame; price queries `staleTime: Infinity`; components read with `select`; no polling in hidden tabs; charts updated with `series.update()` outside React | The references poll ~30 hooks + ~12 timers (a room every 9 s even hidden); web-stack §3, §6 |
| D41 | **Rendering:** Next 16 `cacheComponents` + React Compiler (Babel plugin; the experimental Rust compiler off); `agentRules: false` (16.3 `next dev` otherwise writes AGENTS.md/CLAUDE.md); `partialPrefetching: true` (one App Shell prefetch per route); each page = static shell + `'use cache'` metadata/history with `cacheTag` (refreshed by `updateTag` on resolve) + `<Suspense>` for live and per-user parts; `loading.tsx`/Suspense in every dynamic segment (the App Shell boundary under partial prefetching); the wagmi cookie read sits inside a Suspense-wrapped provider; **route-group provider split** (landing, docs, proof and status load no wallet stack); Route Handlers for auth, relay, stream-token minting and app APIs; pages kept alive by `<Activity>` (≤ 3 routes) reset transient state in `useLayoutEffect` cleanup or Link `onNavigate`, dialogs with init logic derive `open` from a search param, e2e uses `getByRole`/visible filters | web-stack §1, §9; the references ship ~2.5 MB JS on every route |
| D42 | **Performance budgets enforced in CI** (§3.1) | Performance is designed in, not audited at the end |
| D43 | **One `TxLifecycle` component family** for every write: idle → blocked(reason) → review → signing → submitted → confirmed → settled/delivered, plus failed(diagnosis, moneyMoved) and unknown (reconciling by `validBefore`); optimistic "confirmed-pending" with rollback; cream receipts with explorer links; "key used" receipts for access-key and session-key spends; confirmation tiers (tap-only under caps · passkey for root actions · typed confirm for irreversible creation); undo window for non-urgent revokes | ux-audit §11.1 |
| D44 | **`/settings/account` is the trust surface:** passkey devices + backup-passkey prompt after the first deposit; every live key/grant (tap, wallet, copy, X, duel, theme) with scope, remaining limit, expiry, last used, history, revoke and revoke-all; linked wallets (Robinhood, X); AI consent, export, off-chain deletion; biometric lock; region posture | Delegated signing needs one place to see and stop it (ux-audit §11.8) |
| D45 | **Chain-library corrections (chain-libs.md):** SSTORE2 root-key only (D10); ThemeRouter `sync` (D14); the adapter proxy is `new TransparentUpgradeableProxy(impl, SAFE, initData)` (OZ 5.6 requires init at construction and creates its own ProxyAdmin) with `_disableInitializers()`; Foundry `network = "tempo"`, gas via snapshot cheatcodes + `--gas-snapshot-check`, no test relies on transient storage across calls (isolation); `afterInvariant()` runs the settle-and-redeem-everyone conservation check in every run; Solady `ffs/fls` return 256 on zero (guard empty words); `lnWad` refuses ≤ 0 (named error first, `fullMulDiv` for ratios); Sourcify verification at `contracts.tempo.xyz`; `@custom:storage-location` annotations; X7 also checks whether TIP-1016 is live | Docs contradict four plan lines |
| D46 | **Web-library corrections (web-stack.md):** wagmi 3 names (`useConnection`, `getConnection`…); viem `withRelay` (not `withFeePayer`); `Handler.webAuthn`/`Handler.relay` built once at module scope; KV via Redis `Kv.from` with an atomic `take`; the relay route also catches `/api/relay/:chainId`; relay `features` off; `rpId` chosen once; `next/image` `preload` (not `priority`); `proxy.ts` runs on Node; accounts pinned `~0.18.4` (0.19 moves the relay toward `tapimo`, adopted by D-entry later); trades via `sendTransactionSync({ calls, feePayer: true })` | Docs of the pinned versions |
| D47 | **Mobile-library corrections (mobile-stack.md), folded into Appendix D:** `injectedJavaScriptObject` on Android; exact-origin bridge checks; splash held until the web `ready`; opaque themed web view + `expo-system-ui`; Android pull-to-refresh on the web side; remount (not reload) after Android render-process death; Android passkeys via a `nativeConfig` web view subclass; per-topic Android channels before the permission prompt; both Live Activity push tokens; chart island ticks through `useDOMImperativeHandle`; `appVersionSource: remote`; MMKV v4 `createMMKV`; Reanimated 4 transforms/opacity only; the research's `formSheet` More and confirm sheets are rejected by the overlay rule (the More panel is a Reanimated right-edge view inside the WebShell route, closed by Android back; confirmations are centred `transparentModal` cards) | Docs of Expo SDK 57 and its libraries |
| D48 | **Tests prove functionality; they are not a deliverable.** Each stage writes the tests that prove its money paths, encoders, protocol conversions and must-not-break flows; plans and gates never count tests | Owner instruction 2026-09-29 |

### 1.3 Corrections to the architecture and ledger (applied by S0's doc sync)

`17` §3.2/§4.1 and ledger L-27/L-28/L-53/L-55/L-58/L-63/N-03/N-04/AG-3/20/23/TH-03/04/13 (EventVault ported; no
KeyPolicy); `17` §5.3 + ledger ST-10 + `13` design implications (hook flags `0x20C0`; multiplier ×, not ÷; replay =
7 txs, WETH9 excluded, UR `0xa2dc` pinned); `17` §8.1 relay policy path; `17` §12 drop `src/keys/`; `17` §12 and ledger N-10 `tempo = true` → `network = "tempo"` (D45); P6 exceptions
(delegated vault actions credit the grant owner; bridge deliveries credit the message recipient).

**Mobile corrections:** ledger L-19 and Y-17 become **Additive — reconstruction** (Yosuku shipped an Expo app; source
absent; MIG00:92) mapped to the new §11 rows **MOB-01…MOB-14** (listed in D.12); L-18 gains the TestFlight/APK download;
`17-architecture.md` gains a mobile section (D27–D34, Appendix D summary); C.3.1 makes WalletConnect required (phones
have no injected wallet for bridge-in); C.3.7 `/native-auth` becomes the real app handoff (SM2), not a Blocked page.

**UX corrections (2026-09-29):** ledger gains rows **UX-01…UX-12** (Appendix E.6) for the fixes the references lack;
`17-architecture.md` gains a UX + performance section (§2–§3 of this plan); `context/tempo/05-product-vision.md` notes
owner answer 9; `docs/design/` is created (tokens, component register, flow targets).

## 2. UX system

### 2.1 Principles
1. **Fidelity of identity and flows, not of weaknesses.** Masayume's look and every flow stay (answer 9); the
   references' friction, bugs and dead ends are fixed while porting (ux-audit §12), never copied "verbatim".
2. **Speed you can feel:** tap feedback ≤ 100 ms (pressed state + haptic in the app), optimistic state immediately,
   Tempo confirmation (~0.5 s) shown as it lands; never a bare spinner — every wait is named.
3. **Honesty grammar (D36):** the CTA names its blocker; failures say whether money moved; every value move has a receipt.
4. **Dollars first, crypto behind "How this works":** pathUSD, access key, TIP-20, LayerZero, multiplier, receive policy
   appear only in disclosures and receipts; "No fees to pay" is true on Tempo and says so on the CTA line.
5. **Explain at first use, not up front:** first bridge, first follow, first launch get a short explainer; no tutorial
   wall.
6. **Phone first:** 390 px primary, no overflow at 320; ≥ 44 px targets, ≥ 16 px inputs, CTA always visible (sticky with
   safe-area inset), the keyboard never covers an input; centred modals and the right-edge slide-over (owner rule).
7. **Accessible by default:** keyboard reachable, visible focus distinct from the active state, `aria` on live figures
   (polite), reduced motion honoured, colour never the only signal for Up/Down.

### 2.2 Design system
- **Tokens:** Masayume's CSS custom properties (`web/src/styles/**`) extracted in S1 into `packages/tokens` (one
  `tokens.json` → `web` CSS variables checked against the ported styles, Tailwind 4 `@theme inline` utilities, the
  native Uniwind theme); trading tokens `--up`, `--down`, `--yes`, `--no`, `--chart-*` read at runtime by the charts.
- **Type and numbers:** Masayume's faces via `next/font` (swap); every figure through the `numbers` utility (Plex Mono);
  rolling digits with `@number-flow/react` on headline figures only (`willChange` there; `NumberFlowGroup` for figures
  that move each other); dense lists updating every second use plain `numbers` text or `animated={false}`.
- **Primitives:** Base UI only (no Radix mix); lucide icons; `motion/react` `m.*` under `LazyMotion(domAnimation)` and
  `MotionConfig reducedMotion="user"` (`domMax` only on routes with drag/layout); transforms and opacity only. Base UI
  setup: root `isolation: isolate`; `body { position: relative }` (iOS 26); `CSPProvider` nonce; Drawer for the gesture
  slide-over (ticket, More panel: `swipeDirection="right"`, Viewport `fixed inset-0 flex items-stretch justify-end`),
  positioned Dialog otherwise; motion exits via `keepMounted` + `render={<m.div/>}`; toasts on Base UI `Toast`
  (`createToastManager`), not sonner.
- **21st context:** `docs/design/DESIGN.md` + `docs/design/design.json` (tokens, rules, overlay rule) are the source; the
  local `.21st/` context is generated from them for `21st search --context auto` and `21st review` and is gitignored (no
  tool config in the repo).
- **Component register:** `docs/design/components.md` — for each adopted 21st component: id, author/slug, where used,
  what was changed; `21st review <paths>` + an axe check run on every UI step.

### 2.3 Sourcing workflow (every UI step)
1. Look up the surface in Appendix E; if the pick doesn't fit, `21st search "<need>" --context auto` (2–4 phrasings).
2. `21st get <id>`; read its code for a11y, states and dependencies; never add a dependency outside §2.2 without a
   D-entry (avoid recharts, visx, gsap, headlessui, qrcode.react, swr — ux/21st-map "avoid").
3. Revamp per D35; wire to the real data and `TxLifecycle`; add every state.
4. Verify: `21st review`, axe, the UX gate (§2.5), screenshot at 390/320/768/1440 in both themes.
5. Record in the component register.

### 2.4 Flow targets (measured at the stage gates)

| Flow | Prompts | Feel |
|---|---|---|
| Cold visit → funded → first call | 1 passkey ceremony | faucet lands during sign-up; ticket ready with a remembered default stake |
| A tap (armed wallet key or session key) | 0 | pressed state ≤ 100 ms; Call card ≤ 1 s p50 |
| Verdict → paid | 0 | verdict pinned to the position; auto-paid; push in the app |
| Claim leftovers | 1 batch (sponsored) | "Collect" on top of Portfolio when non-zero |
| Copy an agent / follow a theme | 1 (+1 if X4 splits) | arm-modal grammar; caps behind "adjust" |
| Stock buy/sell | 1 | quote age tick; guard/session reasons on the CTA; optimistic holdings |
| Bridge in | 1–2 in the source wallet | stepper + in-flight tracker that survives app kills; push on delivery |
| Launch a stablecoin / memecoin | 1 | typed confirm for the currency code; per-call progress |
| Earn withdraw | 1 | keeper settles closed Windows ("Settling 2 of 4"); partial withdraw |

### 2.5 UX gate (added to every UI stage gate)
Targets ≥ 44 px and inputs ≥ 16 px; no horizontal scroll at 320; CTA visible without scrolling on tickets and drawers;
keyboard never covers an input; every state rendered (loading, empty, error, stale, blocked, pending, success); no raw technical error
text reaches the user; both
themes; reduced motion; axe clean; `21st review` clean; Lighthouse mobile within §3.1 on the stage's routes; flow targets
(§2.4) met on a real phone for flows the stage touches.

## 3. Performance architecture

### 3.1 Budgets (CI-enforced: route-budget script over the build manifests + Lighthouse CI at 390 px, 4× CPU, 4G)

| Metric | Budget |
|---|---|
| First-load JS (gzip), landing/docs/proof | ≤ 120 KB |
| First-load JS (gzip), app routes (`/markets`, `/stocks/[symbol]`, `/themes`) | ≤ 250 KB; lazy islands: `/markets` hero chart, ticket slide-over body, onboarding/wallet modals, WalletConnect, share canvas + QR (`import()` on tap), confetti, command palette, Sensei dock · `/stocks/[symbol]` chart, swap ticket · `/themes` deck (`domMax`) · `/bridge` WalletConnect · `/games/*` one chunk per game |
| CSS per route | only the route's CSS (no 650 KB global sheet) |
| LCP / INP / CLS (p75 field, mobile; lab LCP/CLS/TBT gated in CI) | ≤ 2.5 s / ≤ 200 ms / ≤ 0.05 (lab TBT ≤ 200 ms) |
| Tap feedback / trade confirmation shown | ≤ 100 ms / ≤ 1 s p50 |
| App cold start to interactive (`markInteractive` on web `ready`) | ≤ 2.5 s on a mid-range phone |

### 3.2 How
- **Rendering (D41):** static shell + cached metadata + streamed live parts; fixed-height chart placeholders (no CLS);
  Masayume's faces via `next/font` (Noto Serif JP subset to display glyphs, ≤ 2 preloads); `preload` only on
  the LCP image; per-segment `loading.tsx`; hover prefetch on long lists.
- **Data (D40):** one QueryClient shared with wagmi (per request on the server, singleton in the browser); RSC
  `prefetchQuery` without await + dehydrate pending queries (`shouldRedactErrors: () => false`); default `staleTime` > 0;
  optimistic mutations for trades, posts, follows; persistence only for slow data (market list, watchlist), busted per
  build.
- **Chain:** multicall reads (one `useReadContracts` per screen, lens batch views `marketsOf`/`positionsOf`), WebSocket
  transport first with batched HTTP fallback, event watchers write cache entries, `sendTransactionSync` returns the
  receipt in one round trip, expiring nonces set explicitly on every tap (X21).
- **React 19.2:** `useEffectEvent` keeps stream subscriptions stable; non-urgent updates in `startTransition`;
  `<Activity>` pre-renders the ticket slide-over; rate limits on `/api/auth/*` ceremony routes (per IP/device, Upstash).
- **Clock:** one shared clock read only by leaf components that display time (the references re-render whole screens
  every second).
- **Visual cost:** the grain/blur/marquee effects dropped for coarse pointers and in the app shell; the dead custom
  cursor removed.
- **Games and heavy media:** per-game `next/dynamic` chunks; audio loaded on first play, music off by default in the app.
- **Server:** `/api/index/*` public reads cached (`s-maxage`), wallet reads `no-store`; Neon pooled for web; SSE served
  from ops on Fly; relay/auth handlers at module scope.
- **Mobile:** splash until web `ready`; one warm web view; MMKV shell state picks the first URL and background colour;
  Metro `inlineRequires` + tree shaking; `expo-observe` cold-start metric.
- **Measurement:** Vercel Speed Insights on both deployments; the budgets above fail CI; `/status` shows the stream lag.

## 4. Rules for every stage

- **Read order:** `docs/plan/STATUS.md` → current stage file (first unchecked box, then Handoff) → last 10 D-entries +
  open Q-entries → only the spec sections the stage names → `git status && git log -5` → fast gate.
- **Scope:** never cut, hide, defer or thin; never pull a page from the nav. Real integrations; disclaimers, not mocks.
- **UX:** every UI step follows §2.3 (21st pick → revamp → review → register) and meets §2.5; nothing ports "verbatim"
  without its ux-audit fixes (Appendix E.5).
- **Libraries:** before coding against a library, read its Context7 docs for the pattern in use and cite them in the step
  (the research files are the starting point); version-specific APIs follow D45–D47.
- **Tests:** write the tests that prove the step's functionality (money paths, encoders, conversions, flows); they are
  not a deliverable and are never counted (D48).
- **Code:** pnpm; files ≤ 400 lines; only `packages/markets` does chain I/O; `packages/core` pure; integer money; no
  secrets in logs or git; **no `CLAUDE.md`/`AGENTS.md` anywhere** (Masayume's `web/` copies and `reference/` ones are not
  carried); `.21st/` is local and gitignored.
- **Contracts:** Foundry ≥ 1.8.3; default profile = Tempo (`network = "tempo"`, solc 0.8.30, via_ir); profile `evm` for
  `src/{robinhood,transit,common}` with an explicit `evm_version`; never compile PoolManager/PositionManager/UR (fixtures
  or forks only). Pay `msg.sender` only (two documented exceptions, §1.3); receive-policy pre-check on every payout; no
  `payable`/`msg.value`/`address(0)` currency (the OFT `send` is interface-payable and rejects value); batched approvals,
  no permit signatures for passkeys; no calldata suffixes on precompile calls (T11); no CREATE in any flow an access key
  signs.
- **Provenance:** every ported file has `Ported from Masayume 68f7a09:<path>` or `Agari <sha>:<path>` (record the SHA
  actually read — Agari's trunk moves daily); inherited rules labelled inherited; adopted 21st components carry
  `From 21st.dev <id> <author/slug>`.
- **Shared files:** dependencies installed in S0; fragments `contracts/deployments/<chainId>/<area>.json`,
  `docs/plan/acceptance/S<n>.md`, `packages/markets/src/<area>/`, `packages/markets/src/relay/policies/<area>.ts`,
  `packages/db/migrations/<area>/`; one integrator merges; ≤ 4 agents per wave in worktrees `../cwf-wt/<name>`; trunk
  `integration/t1`, stage branches `stage/S<n>-<slug>`, lanes `slice/S<n><x>-<slug>`.
- **Mobile:** the app holds no server secrets (server-only code lives behind `@cwf/markets/server`, never bundled by
  Metro); the bridge accepts messages only from our exact origins; the testnet build has no mainnet code path or remote
  switch (guideline 2.3.1(a)); native changes ship as EAS builds, web content as web deploys; every web route stays
  reachable in the app (tabs + More panel).
- **Relay allowlist per stage:** each contract stage adds its policy file; its gate checks the sponsored call lands,
  another selector is refused, capital intake is not sponsored.
- **Commits:** one per step, `<type>(S<n>.<step>/<area>): <summary>`, trailers `Stage:`/`Parity:`; tick the box in the
  same commit; never end dirty.
- **Evidence:** every tx into `acceptance/S<n>.md` after `cast receipt` (failures kept); parity rows advance only at
  gates; plan changes only through D-entries; **every live mainnet action needs the owner's go.**

## 5. Spikes (each runs as the first step of its Stage column; wave-1 stages on day 1; each writes an acceptance row)

| # | Spike | Stage | Decides |
|---|---|---|---|
| X1 | LayerZero ping on RH testnet ⇄ Base Sepolia ⇄ Moderato (4 legs) + dummy OFT round trip | S14 | compose native value from RH and Moderato, LZD `quoteSend` units, fresh-address mint gas, latency |
| X2 | Replay tx 1 (PoolManager, ~25M gas via Arachnid) on Moderato | S15a | the replay path works |
| X3 | UR ABI probe on a mainnet fork (`ExactInputSingleParams` with/without `minHopPriceX36`) | S15a | the one v4 encoder |
| X4 | 5-token access-key authorization gas; does `getKey` see a key authorized in the same tx; passkey prompt count | S16 | one tx vs split follow |
| X5 | Compound TIP-403 `(1, blacklist{PoolManager}, 1)` blocks a coin → PoolManager settle but allows mint/transfer to the launchpad | S17 | memecoin pre-graduation guard |
| X6 | forge `network = "tempo"` on a mainnet fork (precompiles, pranked TIP-20 holders) | S2 | fork testing |
| X7 | Engine storage-credit gas: clear then recreate; does the 30M general lane count gas net of refunds; is TIP-1016 live (refunds excluded from block gas; code at 2,500 gas/B) | S2 | recycled-Book contingency; SSTORE2 cost |
| X8 | Injected wallet (MetaMask, Rabby) behaviour on Tempo: fee deduction, native-balance precheck | S1 | injected capability set |
| X9 | `auth/verify.ts` conformance: secp256k1 / P-256 / WebAuthn local verify == `SignatureVerifier.verify` on Moderato | S1 | server auth |
| X10 | `anthropic.mpp.tempo.xyz` unpaid 402: charge vs session intent | S3.5 | receipts design |
| X11 | Owner starts daily Robinhood testnet faucet claims (5 × 5 tokens/24 h) | S0 | seed inventory for pools |
| X12 | RedStone verifier `verifySpot` ("latest" mode) reused by `StockReference` | S2/S15b | reference source on Moderato |
| X13 | Passkey inside `react-native-webview` on iOS: dev build with `webcredentials:<domain>` + AASA served by Next.js; sign in with an existing web passkey; one sponsored tx via the relay; the WebCrypto session key in IndexedDB survives an app relaunch | SM1 | phase A works on iOS |
| X14 | Passkey inside Android WebView (androidx.webkit web-authentication support + `assetlinks.json`); fallback = native Credential Manager passkey + `android:apk-key-hash` origin in `Handler.webAuthn` | SM1 | phase A on Android |
| X15 | Secure Enclave P-256 key signs a Tempo tx (`prehash: true`, DER→(r,s), low-s) accepted on Moderato; Android StrongBox equivalent | SM3 | hardware session keys |
| X16 | Native passkey (`react-native-passkey`) assertion produces the same Tempo address as the web passkey | SM3 | phase B account ownership |
| X17 | Accounts SDK + viem on Expo 57 (peer ranges `^55`, nitro `^0.35`; polyfills `react-native-get-random-values`, `MessageEvent` shim) | SM3 | RN compatibility |
| X18 | WalletConnect from inside the web view on a phone: the bridge-in flow opens a wallet app (`wc:`/universal links via native `Linking`) and returns | SM1/S14w | bridge-in on mobile (AppKit RN's wagmi adapter needs wagmi < 3) |
| X19 | EAS build + submit with an individual Apple account (Apple ID login for credentials; App Store Connect record; internal TestFlight group; `eas device:create` for the owner's iPhone) | SM1 | the delivery pipeline |
| X20 | Wallet-mode access key (D38): authorize in the passkey sign-in ceremony with scopes {engine place/cancel/redeem/withdrawCredit, pathUSD `approve(engine)`} and a daily pathUSD limit (after the S2 engine deploy); ten `[approve exact, placeOrder]` taps signed by the key with no prompt; the limit refuses the eleventh; revoke works | S4 | no-prompt wallet trading |
| X21 | Rapid taps: five orders from one key within 2 s, each sent as an expiring-nonce tx set explicitly (`nonceKey: maxUint256`, `nonce: 0`, `validBefore` ≤ now + 25 s; protocol max 300 s since T11; viem only auto-selects this with a fee payer or same-tick sends), land without head-of-line blocking; 2D lanes (`nonceKey` 1…) only for ordered streams (agents, keeper) | S4 | tap cadence |
| X22 | Does `TIP20_FACTORY.createToken` count as CREATE for an access-key-signed tx (memecoin create, stablecoin batch) | S17 | whether launches must be root-signed |
| X23 | 21st pipeline: generate `.21st/` context from `docs/design/`, `21st get` the ticket pick (16240) and the swap pick (27122), revamp one into Masayume tokens under Base UI + `m.*`, pass `21st review` + axe | S1 | the revamp recipe works on our stack |

## 6. Stages (step level)

Each stage becomes `docs/plan/stage-<nn>-<slug>.md` with these boxes plus Findings and Handoff. "Src" = the file or
pattern ported from. Spec references are to the appendices (A = contracts pillar 1, B = pillar 2 + launch, C =
off-chain).

### S0 — Bootstrap, hosting, decisions, archive (M0)
- [ ] S0.1 `docs/plan/{00-plan (this plan), STATUS, decisions (D-001…D-009 owner; D-010… = §1.2; Q-table §8), parity
  (working copy of ledger 12 + Owner/Status + MOB and UX rows), working-rules, owner-actions (dated, §8), fragments,
  env-matrix}.md`; `docs/specs/{engine.md ← App. A, pillar2.md ← App. B, offchain.md ← App. C, v4-replay.md ← B.3.1
  table, mobile.md ← App. D, ux.md ← App. E}`. Src: Agari `docs/plan/working-rules.md`.
- [ ] S0.2 Doc sync (§1.3) in `context/tempo/17`, `12`, `13`, `04`, `05`, `STATUS.md`.
- [ ] S0.3 Root: `package.json`, `pnpm-workspace.yaml` (catalog C.1.3; workspace includes `mobile`, whose Expo-pinned
  React/RN versions live in a named `mobile` catalog, D.1), `tsconfig.base.json`, `vitest.config.ts`, `.nvmrc` 24,
  `.gitignore`, `THIRD_PARTY_NOTICES.md`. Src: Masayume root.
- [ ] S0.4 Scaffolds: `packages/{core,markets,brain,db,clients}`, `services/ops` (hello `runActor` + `/health`),
  `web` (hello + `/api/health`), `scripts/{codegen,invariants,keys,deploy,drive,archive,e2e}`.
- [ ] S0.5 `contracts/`: `foundry.toml` (default Tempo, `evm`, `ci`, `invariant` profiles, rpc endpoints), all libs
  (forge-std, tempo-std@b9860ac, OZ 5.x + upgradeable, solady, OZ uniswap-hooks@2ae32be, v4-core@46c6834 +
  v4-periphery interfaces/libraries, LayerZero oapp-evm/oft-evm/oft-evm-upgradeable/protocol/messagelib/test-devtools),
  `script/lib/DeploymentWriter.sol`, `deployments/README.md` (fragment schema C.1.6).
- [ ] S0.6 `scripts/codegen/clients.mjs` + `packages/clients/src/pinned.ts` (C.1.6). Src: Masayume `contracts/export.mjs`.
- [ ] S0.7 `scripts/invariants/*` with the rule set C.1.2. Src: Masayume `scripts/invariants/*`.
- [ ] S0.8 `.github/workflows/{ci,contracts,nightly-fork,deploy-ops}.yml`.
- [ ] S0.9 Hosting (owner accounts): Vercel ×2, Fly ×2, Neon ×2, Upstash; DNS on the final domain (Q-019).
- [ ] S0.10 Keys: `scripts/keys/{generate.mjs,fund-moderato.ts}` (addresses only in acceptance); Robinhood testnet
  ETH + daily faucet claims start (X11); Base Sepolia ETH; capped mainnet MPP wallet once Q-020 is approved.
- [ ] S0.11 Archive takeover: `packages/db/migrations/prints/0001_print_archive.sql`; price-relay archive-pass on Fly
  (`OPS_ACTORS=archive`, no key); `scripts/archive/import-agari.ts` (Agari `stocklana/data/archive/redstone/*.jsonl`
  + a `print_archive` dump); overlap check; then the owner retires the laptop archiver.
- [ ] S0.12 `infra/{secrets.md, env/*.example, vercel.md, fly.md}`; README pre-existing-code disclosure.
- [ ] S0.13 `docs/design/{DESIGN.md, design.json, components.md, flow-targets.md}` (tokens, overlay rule, §2 principles,
  §2.4 targets); copy the two plan-mode reports (`~/.claude/plans/sunny-forging-simon-agent-a06e6eaf7974656e0.md` →
  `context/tempo/research-2026-09-29/open-libs.md`, `…-agent-a983473fcdee56215.md` → `21st-weak.md`);
  `docs/libraries.md` indexing the Context7-derived notes (research files + D45–D47) per library;
  `.gitignore` gains `.21st/`; CI budget job skeleton (§3.1).
- **Gate:** `pnpm install && pnpm typecheck && pnpm invariants && pnpm codegen:check`; `forge build` both profiles
  (version recorded); hello + `/api/health` on the final domain; ops `/health` 200 with `archive` beating and a
  boundary row archived < 60 s after T; keys funded; design docs present. **Rows:** N-10, N-11, M-15.

### S1 — Web shell, accounts, relay, geofence (wave 1)
- [ ] 1a core: port Masayume `packages/core/src/**` minus Somnia modules (C.2.1 list); add Agari
  `packages/core/src/{market,orders,reserves,auth,types/session-lanes}`; types per C.2.1 (drop poolAddress/nonce/token
  ids/venueId; `MarketStatus` clock-derived); calendar = RedStone `NY_MARKET_NEXT_CHANGE_TIME` ∩ Alpaca; tickers 9 names +
  SPCX + BTC/ETH/SOL; stubs `stocks/ bridge/ themes/ launch/` with vectors.
- [ ] 1a markets surface: `packages/markets/src/{chains,env,deployments,errors,runtime,tx,sessions,submitter,relay,auth,
  faucet}` (C.2.4); provider answers `Reading` "not deployed" per area; journal with `validBeforeSec`. Package exports
  split from day one: `@cwf/markets` (browser/native-safe), `@cwf/markets/server` (relay, auth verify, faucet, mpp,
  indexer API, signing with server keys), `@cwf/markets/react`; `IntentStore` adapters (memory, localStorage; MMKV added
  in SM3); randomness via `crypto.getRandomValues` only (polyfilled on native).
- [ ] 1b tokens + design base: `packages/tokens` from Masayume's CSS variables (§2.2) with a check against the ported
  styles; Tailwind 4 `@theme inline` + trading tokens; `next/font`; `LazyMotion` + `MotionConfig`; Base UI; spike X23.
- [ ] 1b shell: port Masayume `web/src/{app/layout.tsx, components/**, styles/**, providers/{AppProviders,MarketsBoot,
  query-client,persist}, features/{recovery,install}}` **with the ux-audit fixes** (E.5 S1 row): `viewport {viewportFit:
  'cover', themeColor}` and safe-area insets on header, ticker, strip and panels; back chevron below top level; compact
  top chrome; route-group providers (landing/docs/proof/status carry no wallet stack, D41); `loading.tsx` per dynamic
  segment; global session banner + Agari's `BootNotice` mounted; distinct not-found copy; the grain/blur/marquee cost
  dropped on coarse pointers; dead cursor and dead `components/chrome/*` removed; one shared leaf clock; header/nav +
  Stocks/Themes/Launch; More panel (right edge, owner rule) with a search row and merged rankings/history groups;
  `/markets/[id]` renders (Agari) instead of Masayume's id-dropping redirect; route-coverage test; `/dev/*` gated; every
  nav route pre-registered with `CapabilityPending`. Also: web pill labels 11 px from one label stylesheet; focus ring
  distinct from active; skip link; StaleTick in local time with one `aria-live` region per screen; marquee duplicates
  `aria-hidden`, text ≥ 11 px, contrast ≥ 4.5:1 (muted inks adjusted within the palette); per-route-group CSS split of
  the global `@import`s; `beforeinstallprompt` captured app-wide and AppStrip hidden when installed; `CreditWelcome`/
  `AddFunds` lazy; legacy redirects add `?note=moved`; `/tickers/[symbol]` → `/stocks/[symbol]`; external links
  through `open-external` in the shell. 21st starts (E.1): header 27109, account pill 24857 + 1600, nav
  active-pill technique 21349 + 19177, panel 31360, command palette 31354, toasts 24297, skeletons 23557, empty/error
  19745 + 29419, segmented control 23552.
- [ ] 1b onboarding (D37): the one-ceremony centred modal — passkey create/sign in (21st 19045 layout; 20041's flow
  without its bottom drawer) → server faucet funds without a user signature → land on `/markets` (the ticket and its remembered
  stake attach in S4); the modal has a slot for the arm step, filled when its target exists (wallet access key in S4 once the engine
  is deployed; Trading Balance arm in S7 once EventVault is); contextual first-use explainers replace the 5-step
  tutorial (Masayume `features/onboarding` copy reused where it still fits).
- [ ] 1b transactions: `web/src/components/tx/*` — the `TxLifecycle` family (D43): state machine in
  `packages/core/src/tx/lifecycle.ts` (pure, tested), CTA-with-blocker, signing/submitted/confirmed chips, failure card
  with "moneyMoved", cream receipt (Masayume), "key used" receipt, confirm tiers, journal hooks.
- [ ] 1b wallet: `web/src/providers/wallet/*` per C.3.1 (Agari replica file-by-file, wagmi 3 names per D46; wallet-picker
  layout from 21st 8588, centred); `lib/wallet-session.ts`; `UserSessionProvider` with memoised, split context values (no
  per-second re-render); wrong-network banner mounted; two-wallet model (Tempo + Robinhood Chain + Base Sepolia);
  capability flags come from the connector (so SM3's `shellDevice` connector can declare full Tempo caps); the connector
  config carries the `accessKey.authorize` hook, activated in S4 when the engine address exists (D38); phone picker never
  dead-ends in mobile Safari (passkey first, WalletConnect listed).
- [ ] 1b `/settings/account` shell (D44): passkey devices; the live keys/grants list reading AccountKeychain + vault
  grants (scope, remaining limit via `getRemainingLimitWithPeriod`, expiry, last used, revoke, revoke-all behind
  hold-to-confirm 23527); S4 adds the wallet key, S7 grants, S9/S11/S12b/S16 their keys; S13 completes it.
- [ ] 1b perf gates (D42): `scripts/perf/route-budgets.ts` gzips each route's first-load chunks from the build
  manifests and fails `ci.yml` over §3.1 (`next experimental-analyze` for diagnosis only); `@lhci/cli` `lighthouserc.json`
  (mobile preset with `screenEmulation {mobile:true,width:390,height:844,deviceScaleFactor:3}`, 4× CPU, simulated 4G,
  3 runs, `median-run`, `resource-summary:*:size` as secondary checks; triggered by `repository_dispatch`
  `vercel.deployment.success` with the URL from `client_payload.url`, plus `workflow_dispatch`; `extraHeaders`
  `x-vercel-protection-bypass` + `x-vercel-set-bypass-cookie`) against the testnet preview for `/`, `/markets`, `/markets/[id]`,
  `/portfolio`, `/proof/[market]`, `/status`, asserting lab LCP ≤ 2.5 s, CLS ≤ 0.05, TBT ≤ 200 ms; field INP/LCP p75
  from Speed Insights on both Vercel projects, checked at each S19 deploy; each later stage appends its routes.
- [ ] 1b real-time client (D40): `packages/markets/src/runtime/stream.ts` — one SSE connection to `stream.<domain>`
  (ops) + chain WS logs → `setQueryData` batched per frame; paused when hidden.
- [ ] 1c routes: `/api/auth/[...path]` + `server/{kv,session}.ts` (C.3.2); `/api/relay` + `/api/relay/status` with a
  `noop` area (C.3.3); `/api/faucet{,/challenge}` (C.3.4); `packages/db/migrations/{relay,faucet}/0001_*.sql` run on both Neon
  databases; `web/src/proxy.ts` + `lib/region-mark.ts` per-pillar
  geofence (C.3.5; Q-008 default); spikes X8, X9.
- **Gate:** `pnpm build`; browser pass on every Masayume route (390/768/1440 + 320, both themes, 0 console errors) with
  the UX gate (§2.5); budgets (§3.1) green on landing and `/markets` shell; one ceremony from a fresh passkey to a
  funded account (virtual authenticator, then the owner's device); sponsored no-op with fee payer = relay, another
  selector refused; `x-vercel-ip-country: US` → 451 on a funded route, exits open. **Rows:** L-01…L-10, L-18, L-21, L-24, L-25, L-72, L-74, M-09, M-10, M-12, M-13, N-01, N-02, N-12, G-11, UX-01, UX-02, UX-03, UX-07 (shell), UX-10, UX-11.

### S2 — The market engine (wave 1) — money gate (App. A)
- [ ] S2.0 Toolchain check + `script/check-sizes.sh` (fail > 23.5 KB); spikes X6, X7.
- [ ] S2.1 **Interface checklist, signed before freeze:** `docs/specs/interface-checklist.md` — every IDreamDex member
  (A.2.7), the 12 engine semantics, E-01…E-72, and the reads C.2.5 needs (batch `marketsOf`, `positionsOf`,
  `topOfBook`), each mapped to a function and a test; signed by the S4/S7/S8/S10/S12b owners. Freeze
  `docs/specs/engine.md` with the deviation register T01–T10 (A.7). Compile-only interfaces
  `src/engine/interfaces/{IEventsEngine,IEngineLens,IPrintVerifier,IEventsEngineEvents}.sol`, `EngineTypes.sol`,
  `EngineErrors.sol`; tag `engine-abi-v1` (seams can start).
- [ ] S2.2 `EngineStorage.sol`, `libs/{BookLib,Grid,PositionLib}.sol`. Src: Agari `book/{ladder,slab}.rs`, `grid.rs`,
  `matching/{paths,seats}.rs`. Tests `Book`, `HolderList`, `Grid`.
- [ ] S2.3 `libs/MatchLib.sol`. Src: `matching/{engine,place,evict,orders}.rs`. Tests `Paths`, Examples 1–7, `Edges`,
  `Sweep`, `OpenPrintGate`.
- [ ] S2.4 `EventsEngine.sol` (dispatch, funding, `_pull`/`_pay` with P12 + TIP-403 fallback, sets, `withdrawCredit`,
  `reserveNodes`, `sweepSurplus`, `extsload`, roles, mode, transient guard). Src: `user_place_order.rs`, `user_sets.rs`.
- [ ] S2.5 `libs/AdminLib.sol`. Src: `admin_series.rs`, `policy_rules.rs`, `window_rules.rs`, `roller_open_window.rs`.
- [ ] S2.6 `libs/ResolveLib.sol`. Src: `print_rules.rs`, `normalize.rs`, `copy_open_from_prev.rs`, `resolve_rules.rs`,
  `resolve_window.rs`, `redeem.rs`. Tests `Prints`, `Resolve`, `Redeem`, Example 8.
- [ ] S2.7 `verifiers/{RedStonePrintVerifier,DataStreamsPrintVerifier,AttestedPrintVerifier}.sol` + `verifiers/lib/*`.
  Src: `print/{redstone,median,attested}.rs`; fixtures = Agari's two archived TSLA payloads + the SPY v11 report; spike X12
  (`verifySpot` latest mode).
- [ ] S2.8 `EngineLens.sol`. Src: `book_walk/mod.rs`. Tests `Lens`, `Layout`; regenerated `book.vectors.json` (seconds).
- [ ] S2.9 Invariants: `test/engine/invariant/{EngineHandler.sol,EngineInvariants.t.sol}` (Agari's 8 families + cross-
  market isolation) with `afterInvariant()` settling and redeeming every seat and checking exact conservation each run,
  and `EngineRandom.t.sol` (12 × 2,500 deterministic). Src:
  `matching/tests/{random,support}.rs`.
- [ ] S2.10 Gas + sizes: `Gas.t.sol` for every A.1.7 row, cold vs credit, via gas snapshot cheatcodes (per-tx under Foundry isolation) and `--gas-snapshot-check` in CI; Moderato measurements; set `fillsCap` and walk
  `maxNodes`; `docs/specs/engine-gas.md`.
- [ ] S2.11 Deploy: `script/{DeployEngine,RegisterSeries,ReserveNodes}.s.sol` (ensure-style, fails on drift;
  `packages/core/src/market/venue-spec.json`: lot = tick = 1000, minLots 1000, minRest 20 s, maxLead 400,000, caps
  16/16, RedStone strict 300 / admission 900 / threshold 3, check admission 120, divergence 25 bp);
  `deployments/42431/engine.json`.
- [ ] S2.12 Fork + live: `test/fork/{Moderato.Engine,Mainnet.DataStreams}.fork.t.sol`; on Moderato: BTC/ETH/SOL 5m
  series, a Window opened, real RedStone open and close, maker + taker, settle, `redeemFor`, a receive-policy hold.
- **Gate:** every suite green; invariants ≥ 256 runs × depth 500 with `afterInvariant` conservation + the deterministic suites; every contract ≥ 1 KB
  under the limit; gas table; Moderato tx hashes; signed checklist; tag `engine-spec-frozen`. **Rows:** M-01…M-05,
  E-rows, G-02, G-06, N-13 (engine).

### S3 — Venue ops (after S2 deploy)
- [ ] Host: `services/ops/src/{main.ts,runtime/*,http/*}` (Agari; single 8080 server; Fly config; dry-run default).
- [ ] Migrations `index/*` (C.4.2), `prints/*`, `social/*`, `games/*`, `x/*`, `strategies/*`.
- [ ] Indexer (C.4.1) + `/api/index/[...path]` (C.4.5). Src: Agari `web/src/app/api/index/[...path]/*`, `db/idx/*`.
- [ ] Actors (C.5.2): roller, price-relay (full, incl. Data Streams path wired for mainnet), settler (settle/void/sweep/
  `redeemFor` after 300 s; skips opted-out products; EventVault `crankSettle` worklist), seed maker (+ crypto σ),
  halt-watch, earnings, calendar (RedStone schedule), spot/stream (the D40 SSE: one multiplexed `GET /v1/stream?topics=…` on `stream.testnet.<domain>` /
  `stream.<domain>`; public topics open; per-user topics need a 60 s HMAC ticket from `/api/stream/ticket` (web session →
  `STREAM_TICKET_SECRET`) passed as a query param, since EventSource can't send headers; exact-origin CORS without
  credentials; `: ping` every 15 s; `Last-Event-ID` resume), funds-watch.
- [ ] `scripts/drive/{recount,halt-replay}.ts`. Src: Agari `scripts/drive/recount.ts`.
- **Gate:** 24 h unattended across a US session and a crypto overnight (open, print, settle, auto-pay); recount ==
  index; recorded halts replayed; Gap proven over the first Friday close → Monday open after the gate (dates recorded in acceptance).
  **Rows:** M-06, M-07, M-08, G-03 (ops), G-07, G-12, G-13, G-14, G-15, L-73, UX-03 (ops stream).

### S3.5 — Platform clients (after S0 + S1 1a; parallel with S3)
- [ ] Spike X10; `packages/markets/src/mpp/*` (access-key payer on an owner root with TIP-1011 limits, charge intent,
  receipt hook → `mpp_receipts`); `packages/brain` `via:'mpp'` (C.5.3).
- [ ] `packages/markets/src/agents/erc8004.ts` (register, setAgentURI, giveFeedback, readAllFeedback; per-network
  addresses) + `/api/agents/[strategyId]/registration.json`.
- [ ] `packages/markets/src/indexer-api/client.ts` + hourly recount; codegen in CI.
- **Gate:** one real MPP-paid model call with its payment reference stored (after the owner's go on Q-020; until then
  the unpaid 402 probe is recorded); an agent registered on Moderato; codegen
  reproducible. **Rows:** N-05, N-06, N-07.

### S4 — First call end to end (M1)
- [ ] Provider methods (C.2.2) and the order lane (C.2.3); `relay/policies/engine.ts` + `scripts/drive/relay-engine.ts`.
- [ ] Spike X20; fill the D37 arm slot with the D38 wallet access key (scopes from `deployments/42431/engine.json`;
  Q-031 defaults); the key listed and revocable in `/settings/account`.
- [ ] Port Masayume `web/src/features/markets/{hero,lanes,word-board,ticket,verdict,claims,balance,portfolio}` onto the
  new types (ticket builds `[approve, placeOrder(IOC)]`, signed by the wallet access key when armed (D38); requote on the
  price-moved error; pre-open PostOnly); claim-all batch; cash-out (Agari `submitter/cash-out.ts`); add-money = faucet
  (testnet); held-by-receive-policy state; live data from the D40 stream.
- [ ] UX rebuild of the hot loop (E.5 S4 row; D36, D39): ticket = Masayume's nine blocks in the right-edge slide-over
  with a sticky safe-area CTA, rebuilt from 21st **16240 be-ui-prediction-market** (Up/Down, quick amounts, payout
  quote, loading/success/error button) under Masayume tokens; stake remembered after a fill; verdict pinned to the
  user's position (Call card → settling → stamp → paid) with an app-wide "your Window settled" toast; auto-pay shown as
  "Paid automatically" (Agari); leftovers in one "Collect" batch at the top of Portfolio; fix ClaimWinnings' false "Paid"
  and the "Placing…" label during claims. Starts (E.1): market card 22249 (+ 2537 layout), countdown 19328, hero chart
  readout/scrub from 20107 around lightweight-charts (ticks via `series.update`, D40), depth 29968, hold-to-confirm
  23527 for cash-out, result reveal 24692 (reduced-motion aware), positions 27124, portfolio chart 29532.
- **Gate (1):** virtual-authenticator run — a crypto call, a stock call during NYSE hours, a win auto-paid after grace,
  a loss, a void shown "Returned"; the §2.4 targets for cold → first call, a tap and verdict → paid; UX gate (§2.5) and
  budgets (§3.1) on `/markets` and `/portfolio`; X20 wallet-key taps; X21 rapid taps; the arm step in the onboarding
  modal (D37 slot) authorizes the wallet key and the key shows in `/settings/account`. **Gate (2):** the owner's own device on a scheduled NYSE date → tag `m1-first-call`.
  **Rows:** L-26, L-29…L-35, L-46 (market portions), N-09, N-13 (UI), UX-01 (wallet arm), UX-04, UX-05, UX-07 (wallet key),
  UX-10.

### S5 — Proof and analytics (after S4, S3.5)
- [ ] `/stats`, `/status` framework (C.6 probes; S14/S15 add LayerZero and v4 probes), leaderboard, `/portfolio/edge`,
  reputation/badges/CSV; **S5 owns the shared profile, share-card and OG components**; `/proof/[market]` with browser
  `eth_call` reverify; `/news` + Finnhub. UX: profile 781 + 29440 (shared with S13); share entry 10388
  Shatlyk1011/social-share-button → native share in the shell; `/proof` feed on 31861 data-table, virtualised, reverify
  with a TxLifecycle "Reading…" state; `/status` without operator copy ("set DATABASE_URL"); `/portfolio/edge` 29532 +
  27124. Src: Masayume `features/{stats,status,leaderboard,edge,share}`, `core/projection`;
  Agari `features/proof`, OG files. UX: rankings merged into one leaderboard with tabs and personal history into one
  page (ux-audit fix 14); 21st starts: stats 7870, status bar 26906 + incident timeline 24943, leaderboard 13063/13057,
  news 20087, share card via Masayume's canvas (lazy).
- **Gate:** browser pass with the UX gate; a proof reverified from the archive; stats == recount; these routes carry no
  wallet stack (budget ≤ 120 KB). **Rows:** L-15, L-16, L-17, L-22, L-23,
  L-47, L-48, L-49, G-10, Y-14.

### S6 — Stock sessions and lanes (after S4)
- [ ] ops `/session` → `features/markets/session` (Agari); halts board; session words; `/api/earnings`; corporate skips;
  marquee session cell + crowd sentiment; Gap on Data Streams (mainnet config) with RedStone archive fallback; G-04
  provider 24/7 lanes labelled; G-05 pre-IPO and NFLX paused honestly on Moderato (Q-007, Q-011). UX: every state
  names the next open time in local time and the CTA carries the session blocker; 21st starts 26906 status-bar per
  ticker (session timeline), 19366 corr/notice-alert (halt/closed banner), 5693 preetsuthar17/system-status-block.
- **Gate:** halted, closed, pre/after and Gap states each render truthfully over a real session. **Rows:** G-03, G-04,
  G-05, G-08 (skips), G-12 (session UI), L-04.

### S7 — Trading Balance: EventVault + tap trading (after S4; contracts A.4.1, web C)
- [ ] Contracts: `src/products/shared/{EngineSeam,Payouts}.sol`; `src/products/vault/{IEventVault,VenueGateway,
  EventVault,VaultTally}.sol` (forwarder removed; D-062; D-091 `Caps.market`; P12 on withdraw; crank opt-out;
  `sweep(bytes32)`); tests that prove it: Masayume's `EventVault.funding`, `.trading`, `CapsVectors`, plus
  `test_D062_churnDoesNotLeakOpenPositions`, `test_D091_grantMarketScope`, `test_engineAccountingMismatch`,
  `test_withdraw_receivePolicyBlocked`, `test_msgSenderIsOwner_noForwarder`, `test_sessionKeyTapFlow`,
  `invariant_vaultPositionsMatchEngine`, `invariant_vaultWalletConservation`; `script/DeployEventVault.s.sol`.
- [ ] Off-chain: `packages/markets/src/vault/*`; `relay/policies/vault.ts` (sponsor: placeFor, withdraw,
  withdrawPrivate, revoke, crankSettle, sweep; never: deposit, depositAndGrant, grant, fundGrant — unchanged from Masayume;
  Q-021 for `place`/`moveToPrivate`); `sessions/session-key.ts` (WebCrypto P-256 account); port Masayume
  `web/src/features/{vault,session}/*` with the E.5 S7 fixes: the arm modal stays one sentence + one button (centred);
  the fallback reason always rendered on the CTA ("Budget used — add 25"); a persistent allowance pill ("Tap-trading ·
  18/25 left · 6 h") with warn-before-expiry, one-tap renew, "Add to budget", "Extend"; "Spent today" updates
  optimistically; memoised split context (no 1 s
  re-render); partial withdraw with Max and inline reasons (Agari `AmountField`); the D37 onboarding slot offers the Trading Balance
  arm (centred, one sentence); settler crank; `idx_vault_*`.
  21st starts: segmented control 23552 for caps presets, hold-to-confirm 23527 for revoke-all.
- **Gate:** passkey root deposits + grants (self-paid), session-key taps sponsored with no prompt, a cap refusal shown
  with its reason (never a surprise prompt), renew/extend, revoke, partial withdraw, killed-tab recovery by
  `validBefore`; the key appears in `/settings/account` (D44). **Rows:** L-08, L-27, L-28, Y-16, UX-01 (Trading Balance
  arm), UX-06.

### S8 — Earn: maker vault (after S4; A.4.2)
- [ ] `src/products/maker/{MakerGateway,MarketMakerVault,IMarketMakerVault}.sol`; tests that prove it: Masayume's
  lifecycle, quoting and fork suites, plus `test_escrowIsMeasuredDeltaEqualsReport`, `test_ownExpiredQuoteEvictedToCredit_bookedAsEscrowBack`,
  `test_thirdPartySweep_bookedAsEscrowBack`, `test_pullAfterLockByAnyone`, `test_mergeAfterLockReverts_settleRedeemsPairsAtPar`,
  `test_realizedPerWindow`, `test_withdrawBlockedWhileExpiredUnsettled`, `test_donationDoesNotMoveSharePrice`,
  `invariant_makerLiquidEqualsWallet`; deploy with Masayume launch params.
- [ ] ops earn-quoter on `runActor` (built for real); `/earn` Agari 4-tab supplier UI (A-2b) with realized/on-paper
  yield (A-2c) and Agari's risk bounds; keeper settles closed Windows before withdraw ("Settling 2 of 4"); partial
  withdraw; "Max is X" instead of silent clamps; a typed inline result (no "✓" string matching); `relay/policies/maker.ts`.
  21st starts: tabs 26923, vault card composed from stats 7870 + balance chart 30538 (weak coverage, E.4).
- **Gate:** the vault quotes live Windows, wallet-mode takers fill against it (EventVault takers too once S7 has
  passed), it settles; depth visible via the lens.
  **Rows:** L-50, A-2b, A-2c.

### S9 — Agents: calls (after S7, S3.5; A.4.8)
- [ ] `src/products/strategy/{StrategyRegistry,IStrategyRegistry}.sol` (+ agentId via ERC-8004 `ownerOf`, follow/fade,
  `maxFee`, SSTORE2 metadata written by the root key only (D10), envelope market scope); its Masayume tests + the A.8 S9 tests +
  `test_metadataWriteRefusedUnderAccessKey`; deploy with per-chain
  ERC-8004 addresses.
- [ ] Off-chain: `strategies/*` markets; `relay/policies/strategy.ts`; strategy-runner + mirror-scan + fade + self-host
  `runner-main.ts`; agent-rater (dry default, Q-001/AG-15 cadence); port Masayume `web/src/features/strategies/*`
  (desk, builder with Reversion, copy batched, board with MPP receipts); Memory Market (Agari) + optional MPP read. UX
  (fix 7): copy = one batched passkey tx (grant + subscribe + approve), pause = one batch; the copier's own P&L panel;
  "No settled trades yet · N open" instead of a blank record; ranking shows P&L with sample size (Q-001); sticky CTA in
  the drawer; Agari's `checkCopyForm`. 21st starts: leaderboard 13063, agent profile 31599 (strip gradients), builder
  wizard 23576, copy button group 26650.
- **Gate:** copy in one tx and stop in one tx; the runner places from a STRATEGY grant; a receipt shown against its
  decision; the copier P&L matches the index; UX gate. **Rows:**
  L-51…L-57, A-1c, A-3b, AG-1…AG-27.

### S10 — Specialist tickets (10.0/10a–c after S4 + S8 depth; 10d after S7; separate worktrees; A.4.3–A.4.7, A.5.4)
- [ ] 10.0 `src/fair/{FairValue,FairValueGuard}.sol` + `packages/core/src/fair/fair.vectors.json` (from Agari
  `seat/fair.ts`) + tests.
- [ ] 10a Parlay: `src/products/parlay/*`; Masayume's lifecycle, pricing and vector suites + D-108, L-38, D-109, PD-2 tests;
  slip composed from 21st 109 + 24524 + the 16240 ticket (weak coverage, E.4).
- [ ] 10b Range + Moonshot: `src/products/range/*` minus `WindowQuestion`; Masayume's lifecycle, pricing,
  RangeMath, vector and Moonshot suites + `test_mustSettle`, `test_staleBasis_driftAbove2Sigma`,
  `test_centerScale_derivesFromGrid`, `test_bandInclusiveCentsAtSeam`; band drawn on the hero chart; range selector from 21st 31347 slider over 32784 distribution bars.
- [ ] 10c Boost: `src/products/leverage/*`; Masayume's open, lifecycle and vector suites + D-114, D-116,
  PD-2 tests; leverage-keeper; leverage slider from 21st 29217 (or 11664).
- [ ] 10d Private: `src/products/private/*`; Masayume's budget and lifecycle suites + D-117 + the three-counter
  invariant; private claims stored server-side per account (the reference's browser-only claims break in the app); desk
  service (P-256-safe committed secret, C.2.4).
- [ ] 10e `/surface` (31861 table + 30538 sparklines); 10d desk from the 27122 swap-ticket layout; web tickets + relay policies per reserve; `/api/prices/{redstone-payload,datastreams-report}`.
- **Gate:** each product opens on Moderato against S8 maker depth using a real RedStone spot payload; thin books refused
  honestly; UX gate on every ticket. **Rows:** L-36, L-37, L-38, L-39, L-40, L-67.

### S11 — Trade from X (after S7)
- [ ] x-relay (EXECUTOR grant, dry-run added); `/api/x/*` with the verifier; `/trade-from-x`, `/claim`; stock cashtags;
  `/go/t/[symbol]/[cadence]`, `/go/w/[marketId]` share-to-sign links (A-3e default); in the app the X OAuth step runs in
  the system auth session through SM2's `/native-auth` handoff (`state` bound server-side to the web session). UX: the
  shared header restored (Masayume's route is header-less); X bind as wizard 23576; mention receipts from 28430
  educalvolpz/tweet-card; linked-account card 28170 olewandowski1/connect-integration-cards; `/claim` = 5247
  ravikatiyar162/reward-card + hold-to-confirm 23527 + TxLifecycle; X errors mapped to human copy. Owner action: X
  account.
- **Gate:** a mention executes once from the EXECUTOR grant; a bind with a passkey signature verifies. **Rows:** L-58,
  L-59, L-60, A-3d, A-3e.

### S12 — Games (after S4; 12a's result card after S5) — 12a ∥ 12b
- [ ] 12a hub, Practice, Lucky (crypto + stocks policy), Line Rider, Candle Hop on ops prices; achievements/profile/
  friends (Agari); result card (S5 components). Perf/UX: one `next/dynamic` chunk per game (today every game route
  loads ~938 KB gz); audio on first play, music off by default in the app; haptics through the shell bridge. 21st
  starts: lucky reel 33159, achievements 13045/12997, matchmaking radar 10759; hub and arcade wrapper composed (E.4).
- [ ] 12b `src/products/games/{ArenaGateway,ArenaAgents,ArenaMatches,ArenaCommitment,GameArena,IGameArena,
  SeasonPrizePool}.sol` (no payable; seat keys sponsored; P12 on `claimCredit`; `_payOrOwe` distribute); Masayume's vector,
  agents, lifecycle, picks and Season suites + the A.8 S12b tests; UX: optimistic swipe queue on the key lane, rematch /
  "Find another", countdowns on the create/join hand-off and reveal, push-paid credit; live params (join 60, reveal 45, minDeck 2); game-room,
  matchmaker/deckmaster, projector (reads `idx_events`), duel-settler; `relay/policies/games.ts`.
- **Gate:** each mode's full state set; one live duel on Moderato with sponsored agent picks, settle, finalize; route budgets on `/games` and one game route. **Rows:**
  L-61…L-71, M-14.

### S13 — Social and assistant (after S4, S3.5)
- [ ] Sensei (brain + optional MPP, streamed tokens; stock holdings line lands in S15e), Room + ticker rooms (position
  gate), takes + cashtags, alerts (basis + staleness gate; delivered by push in the app), reels, `/u/[address]`,
  `/api/social/*`, `/activity` + LifecycleWatcher (filed under Portfolio as the notification centre with a header
  badge), subscription coordinator. UX (fix 10): one app session for joins, follows and takes (passkey session or key,
  not three sign-ins + a signature per take); visitors read rooms, only posting is gated; optimistic posting that keeps
  the draft on failure; reactions; Tail and Fade on takes; the take composer bound to the current card; rooms/takes on the D40 stream. 21st
  starts: chat 26900, takes 2652 + context menu 23646, reels 23559/23568, profile 781, activity 28490, assistant dock
  31661 + 12399.
- [ ] D34 on the web (the app inherits it): report / block / filter on rooms, takes, profiles, agent and token pages
  (`social_reports`, `social_blocks`, word filter, moderation queue in ops), published contact; AI data-sharing consent
  before the first Sensei or agent call (which provider receives what); `/settings/account` deletion of off-chain data
  (profile, takes, room memberships, push devices, X binding, KV session records) with the on-chain disclosure.
- [ ] `/settings/account` completion (D44): backup-passkey prompt, "key used" history, linked wallets, AI consent,
  export, deletion, region posture; `/privacy`, `/terms`, `/contact` (21st 25081 form); `/settings/notifications` (topics grouped Money moved / Social / Games; money on by default); 5 s Undo before
  non-urgent revokes (D43).
  21st starts: form 25081, fields 26523, dialog 31359 (Base UI) + 28339 reasons for report/block.
- **Gate:** one session covers join, follow and take; a room gated on a real engine position; an optimistic post that
  fails keeps its draft; a report reaches the queue; a
  blocked user disappears from the reporter's feeds; deletion removes every off-chain row. **Rows:** L-41…L-45, A-3a,
  A-3c, M-11, MOB-14 (web part), UX-07, UX-09.

### S14 — Stocks on Tempo: the bridge (14c wave 1; 14o after S3; 14w UI after S1, wired and gated after 14c.10, 14o, S4, S5; App. B.1–B.2)
- [ ] 14c.1–2 Spike X1 (`src/lz/LzPing.sol`, dummy OFT round trip).
- [ ] 14c.3 `src/common/{BridgeTypes,BridgeRateLimiter,StockSyncCodec}.sol` + codec fuzz tests.
- [ ] 14c.4 `src/robinhood/StockLockbox.sol` + the B.6 lockbox tests. 14c.5 `src/robinhood/StockSyncSender.sol` (staticcall probes).
- [ ] 14c.6 `src/transit/{TransitOFT,HopComposer,StockSyncForwarder}.sol`.
- [ ] 14c.7 `src/stocks/TIP20MintBurnAdapter.sol` (proxy; `_credit` deferral in order B.1.4; `_payNative` → LZD via
  pathUSD). 14c.8 `src/stocks/{StockSyncReceiver,ScaledUIView}.sol` (pre-warmed slots).
- [ ] 14c.9 `script/stocks/IssueMirrors.s.sol` (B.2) for TSLA, AMZN, PLTR, NFLX, AMD on Moderato.
- [ ] 14c.10 Deploy + `EnsureLzConfig` / `CheckLzConfig` per network (B.1.5 table); fragments `46630/84532/42431`.
- [ ] 14c.11 Invariants (direct + hop: locked == supply + deferred + in flight + owed); sizes both profiles.
- [ ] 14c.12 Forks: RH testnet lock/unlock; Base hop; Moderato adapter (real LZD wrap, fresh-address mint gas); RH
  mainnet CRWD multiplier (effectiveAt 1782999000).
- [ ] 14c.13 Owner-approved outreach: LayerZero direct 40451↔40444 request; Wormhole plan-B probe.
- [ ] 14o ops `stock-sync`, `reserve-watch`, `bridge-watch`; migrations `bridge_messages`, `reserve_snapshots`,
  `stock_sync_messages`.
- [ ] 14w `packages/core/src/{stocks,bridge}`; `packages/markets/src/stocks/{bridge,holdings,reserves,sync}.ts`;
  `relay/policies/stocks.ts`; `/status` LayerZero probe. `/bridge` as a stepper (E.3 bridge): connect Robinhood wallet
  (injected or WalletConnect) → token and amount (remaining rate-limit capacity shown first) → review (fee in and out,
  ETA, destination = your passkey address with avatar) → sign in the source wallet → in flight → delivered; the in-flight
  tracker keyed by guid (source confirmed → verified → executed, both legs on testnet, LZ Scan + both explorers)
  persists server-side and shows on Portfolio; deferred/stuck states with plain actions (`claimDeferred`, resend), never a
  bare spinner. `/reserves`: per-ticker locked | supply | in flight | owed with the conservation check, "as of block N",
  one-tap in-browser re-read, issuer powers and pause-propagation state (ST-15) in plain words;
  a first-use explainer on the first bridge. Holdings in UI amounts; ST-13 disclosure collapsible after
  first acknowledgement. 21st starts: processing timeline 29371 + multi-chain swap 16251 (bridge); stats 7870 + partition
  bar 26545 + status bar 26906 + audit log 25163 (reserves, weak coverage).
- **Gate:** real faucet TSLA locked on 46630 → minted on 42431 via 84532 → burned → unlocked (4 tx hashes + LZ Scan
  links); a `sync` applied through the forwarder and a duplicate ignored; a deferral (recipient receive policy) then
  `claimDeferred`; `/reserves` == both explorers; `CheckLzConfig` green; the tracker survives a killed tab; UX gate. **Rows:**
  ST-01…ST-07, ST-12…ST-15, G-08, UX-08.

### S15 — Stocks on Tempo: trading (15a wave 1; 15b–d after S14 + S3; 15e after S4 + S6 + S13) (M2; App. B.3)
- [ ] 15a `docs/specs/v4-replay.md`; `scripts/v4/{replay-moderato,verify-replay}.ts`; run the 7 txs (X2);
  `test/fork/v4/{ReplayParity,UrAbiProbe}.fork.t.sol` (X3) → freeze `packages/markets/src/v4/encode.ts`;
  `packages/clients/src/addresses/v4.ts` (pinned UR); PoolManager runtime fixture. Sub-gate: a throwaway hookless pool
  initialized and swapped on Moderato via UR `0xa2dc`.
- [ ] 15b `src/stocks/{StockReference,hooks/StockGuardHook,libs/GuardMath}.sol` (X12 result) + tests (incl. CRWD ×4 fork);
  `script/v4/DeployStockGuardHook.s.sol` (HookMiner, reject `0x91` prefix); ops `reference-writer`; `packages/core/src/
  stocks/guard.ts` twin with shared vectors.
- [ ] 15c `scripts/v4/{create-stock-pools,topup}.ts` (B.3.4 house plan); `deployments/42431/pools.json`.
- [ ] 15d `packages/markets/src/v4/{quote,swap,pools}.ts` (batch approvals; receive-policy pre-check before signing;
  mainnet USDC.e route via the aggregator hook); `relay/policies/v4.ts`; `/status` v4 probe. `/stocks` catalogue (21st
  22252 watchlist + 19171 ticker rows, sparklines from 30538) and `/stocks/[symbol]` (cached shell + streamed price;
  reference × m; guard state; honest depth; weekend signal; disclosure; `fee_token = pathUSD`) with the buy/sell card
  from 21st **27122 swap-ticket**: dollars first, quote-age tick and requote on focus, price impact and the guard band on
  the CTA ("Outside ±X % of reference — try a smaller size"), session state on the CTA off-hours, `OutOfBand` mapped to
  "nothing moved", one passkey confirm labelled with amount and minimum received, optimistic holdings with a pending
  chip; restricted regions get an exits-only card, not a wall. Holdings from 29424 (its detail stays a centred Base UI dialog; the 21st-map "sheet on mobile" note is
  overridden).
- [ ] 15e hedge what you hold (A-1a, G-09) reusing the Call ticket + Sensei holdings.
- **Gate:** the owner buys and sells a mirror with a passkey on Moderato; a scripted out-of-band swap reverts
  `OutOfBand` and the UI says nothing moved; the CRWD ×4 fork test passes; a read-only mainnet USDC.e → pathUSD → token
  quote; UX gate + budgets on `/stocks/[symbol]`; tag
  `m2-stocks-on-tempo`. **Rows:** ST-08…ST-11, ST-16, ST-17, A-1a, G-09, UX-10.

### S16 — Themes (16c after S15a + money gate; 16a after 16c, S15, S3.5, S9; 16c.4 deploy after S15b–c) (M3; App. B.4)
- [ ] 16c.1 Spike X4 → D-entry: one tx or split (`setAllowedCalls` chunks ≤ 5 targets).
- [ ] 16c.2 `src/themes/ThemeRegistry.sol` + tests. 16c.3 `src/themes/ThemeRouter.sol` + tests +
  `invariant_routerHoldsOnlyOwedFees` + a test that settlement calls `sync` before each transfer. 16c.4 deploy;
  `relay/policies/themes.ts`.
- [ ] 16a `packages/core/src/themes/{spec,drift,plan}.ts` (JCS hash; UI-amount drift; planner); `packages/markets/src/
  themes/*`; `/api/themes/[id]/agent-key` → ops `/internal/theme-keys` (keys never touch Vercel); `theme_agent_keys`;
  theme-agent/rebalancer actor (B.4.4); ERC-8004 registration; MPP receipts.
- [ ] Web: `/themes` catalogue (Q-004) as a scrollable card deck (21st 8414 card, NAV sparkline 30538, realized vs
  on-paper, holdings chips, agent badge, followers); `/themes/[slug]` (NAV = reference × m; allocation 20086 donut +
  26545 partition bar; a rebalance timeline with the agent's decision, MPP receipt and "key used" receipt; "Next
  rebalance in…" / "Paused: market closed"; cap-refusal and failed-rebalance states); follow modal in the arm grammar
  (one sentence, one button, caps behind "adjust", "What you are signing" disclosure; centred, 26652 alert-dialog base;
  1–2 prompts); unfollow = one confirm with "your holdings stay in your wallet", a 5 s Undo, and a separate "sell everything"
  action; a first-use explainer on the first follow;
  `/themes/create` wizard 23576; one strategy browser with distinct badges and verbs (Copy vs Follow); idle-cash label.
- **Gate:** a follower follows on Moderato; the agent rebalances from the follower's account with no prompt; the MPP
  receipt linked by `decisionId`; an over-cap trade reverts; after `revokeKey` the next rebalance fails; tag
  `m3-themes`; route budget on `/themes`. **Rows:** TH-01…TH-13, N-03, N-04.

### S17 — Launchpads (17a wave 1, web after S1; 17b after S15a, keeper after S3; App. B.5)
- [ ] 17a `src/launch/LaunchRegistry.sol` + `test/launch/StablecoinBatch.t.sol`; `packages/markets/src/launch/
  stablecoin.ts` (9-call batch, address prediction); `packages/core/src/launch/currencyGuard.ts`; `/launch/stablecoin`
  wizard (21st 23576; typed confirm on 25081 v-form-12): review step restating "This cannot be changed later", typed confirmation of the code, a live
  preview of how wallets show it, per-call progress from the batch receipt; a first-use explainer on the first launch; `relay/policies/launch.ts`; spike X22. Sub-gate: a stablecoin created on Moderato in one tx; pair + flip orders visible;
  FeeAMM reserves > 0; a tx paying fees in the new coin.
- [ ] 17b spike X5; `src/launch/{CurveMath,CurveLaunchpad,CurveGraduationLib,LiquidityLocker}.sol` + unit/invariant/
  fork tests; `packages/core/src/launch/curve.ts` + vectors; launch-keeper; `/launch` list (22252 rows + 23549 progress + 30538 sparkline; logo dropzone 377
  use-image-upload); `/launch/meme`, `/launch/[token]`: live
  curve (30538) with your position and progress to graduation (23549), buy/sell with optimistic balance, the anti-snipe
  fee schedule shown before buying, the graduation state machine (Complete → graduating → trading on Uniswap, link, push
  to holders), safety labels (unaudited, creator powers, locker/vesting) and report/block (D34); token page composed
  (weak coverage, E.4).
- **Gate:** create → buys → Complete → keeper `graduate` → hookless v4 pool swaps via UR; locker claims; route budget on `/launch/[token]`; poisoned-pool
  fork test passes; UX gate on every launch route. **Rows:** LP-01…LP-09.

### SM1 — Mobile shell, passkeys in the app, delivery pipeline (after S1's gate + the domain; App. D)
- [ ] SM1.1 Spike X19 + monorepo: `mobile/` Expo SDK 57 app (default template stripped), in the pnpm workspace with
  isolated installs (supported since SDK 54; fallback D.1); EAS project; dev build on the owner's iPhone and an Android
  phone (`eas device:create` first — the individual account can't auto-register devices); App Store Connect record for
  the testnet bundle; internal TestFlight group; single-React check for `mobile/` in CI.
- [ ] SM1.2 Shell contract: `packages/core/src/shell/{protocol,routes}.ts` (zod messages v1, tab map, deep-link
  allowlist) + tests; web shell mode: `web/src/lib/shell/{detect,bridge-client,ShellProvider}.ts(x)`, `proxy.ts` sets
  `cwf.shell` from the `CWFShell/` user agent (Android also reads `injectedJavaScriptObject`), layout hides the web header nav, `MobileBottomNav`, install prompt and
  AppStrip, bottom inset from native; adapters for haptics (`games/feedback.ts`), share (`features/share`), external
  links, alerts' `Notification` (→ push in SM2); Android pull-to-refresh on the web side; `ready` message fired when the
  first screen is painted; `/download` in-shell state.
- [ ] SM1.3 `mobile/src/shell/*`: the single web view (D.2) behind a splash held until the web `ready` (no white flash:
  opaque themed background, `expo-system-ui`, dark splash); native pill tab bar reproducing Masayume
  `components/shell/header/MobileBottomNav.tsx` and `styles/navigation.css` (pill `min(26rem, 100vw − 1.25rem)`, safe
  area, ≤ 420/380 tightening) with 11 px labels (not 9 px), a focus ring distinct from active, the sliding active pill
  (technique from 21st 21349), `expo-glass-effect` on iOS 26 where available; the **More panel slides from the right**
  (owner rule; Reanimated 4 transforms/opacity) with a search row and every destination; exact-origin guard;
  iOS `onContentProcessDidTerminate` → reload, Android render-process death → remount at the last path; native offline
  screen; theme sync; re-tap scrolls to top; `expo-observe` `markInteractive` on web `ready`.
- [ ] SM1.3a Native theme: Uniwind from `packages/tokens` (built in S1): generated `global.css` with light and dark blocks
  keeping the web's variable names; `Uniwind.setTheme` follows the web `theme` message; `useCSSVariable` for colours in
  code; `SafeAreaListener → Uniwind.updateInsets`; `userInterfaceStyle: 'automatic'`; the Android pill on a solid token
  surface (no blur). Native screens follow D.10's design sources.
- [ ] SM1.4 Associated domains (D.4): `web/src/app/.well-known/{apple-app-site-association,assetlinks.json}/route.ts` on
  both hosts with no redirects; `ios.associatedDomains`; Android `intentFilters` with `autoVerify`; `src/app/+native-
  intent.tsx` (`redirectSystemPath` never throws; allowed paths become the web view's first
  `source` URI, so no double load); `Handler.webAuthn` origins += `android:apk-key-hash:…` and
  `https://<rpId>`; `scripts/mobile/check-associated-domains.ts` (our files, Apple's CDN, Google's Digital Asset Links
  API).
- [ ] SM1.5 Spikes X13, X14 (`mobile/modules/webview-webauthn`: enables `WebSettingsCompat.setWebAuthenticationSupport(
  …FOR_APP)` on the RN WebView, androidx.webkit ≥ 1.12.1; fallback native Credential Manager), X18.
- [ ] SM1.6 EAS profiles `development`, `preview` (Android APK; splash verified here), `testflight` (D.8); variant config; icons and splash
  from Masayume's `web/public` assets with a "Testnet" badge; `eas submit -p ios --latest` to internal TestFlight; APK
  hosted with its SHA-256.
- **Gate:** internal TestFlight build on the owner's iPhone and the APK on an Android phone: sign in with the passkey
  made on the web → same address; a sponsored no-op through the relay; a non-extractable WebCrypto P-256 key in IndexedDB (the X13
  spike key; re-checked with the D38 key after S4) survives relaunch; cold start ≤ 2.5 s (§3.1);
  a `https://testnet.<domain>/markets/…` link opens that screen in the app; every web route reachable through tabs/More
  at 390 and 320 with no duplicated web nav; association checks green. **Rows:** MOB-01…MOB-04, L-19 (shell), Y-17
  (shell).

### SM2 — Native services (after SM1; push sources as S3/S4… land; auth handoff with S11; bridge-in with S14w)
- [ ] SM2.1 Push (D.6; per-topic Android channels created at startup before the permission prompt; foreground
  handler answers within 3 s; cold-start taps read via `getLastNotificationResponseAsync`; category ids without `:`/`-`; `addPushTokenListener` re-registers rotated tokens; the foreground banner
  is suppressed when the current route already shows that market; category `verdict_ready` with View and Claim actions;
  channels `calls`, `money`, `social`, `alerts`, `launch`): `packages/db/migrations/push/0001_push.sql`; `/api/push/{register,unregister,prefs}` (web
  session auth; the web app registers the token native hands it); `services/ops/src/actors/notifier/*` (cursor over
  `idx_events` like duel-projector → `push_outbox` with dedupe keys → APNs HTTP/2 token auth / FCM HTTP v1; 410 disables
  the device; retries with backoff); native `expo-notifications` raw device token; permission asked in context (after the
  first call), never at launch; tap → navigate(path); badge count.
- [ ] SM2.2 Topics, each wired when its source stage lands: verdict + payout held (S4), resting-order fills (S4), vault
  grant actions (S7), agent trades on your grant (S9), X receipts (S11), duel matched / your turn / settled (S12b),
  price alerts (S13), bridge delivered / deferred (S14), theme rebalances (S16), graduation of a coin you hold (S17);
  `/settings/notifications` (web, rendered in the shell).
- [ ] SM2.3 Auth sessions + `/native-auth` (D.7): bridge `open-auth-session` → `expo-web-browser`
  `openAuthSessionAsync`; `web/src/app/native-auth/page.tsx` redirects to `<scheme>://auth#…` (pattern from Yosuku
  `reference/yosuku/app/native-auth/page.tsx`) with a named wait "Returning to the app…" and an "Open the app" button
  after 3 s; OAuth `state` bound server-side to the web session; `expo.scheme` = the callback scheme; no `Linking`
  listener on iOS; `preferEphemeralSession: false`; Android `mayInitWithUrlAsync` before opening.
- [ ] SM2.4 Biometric app lock (`expo-local-authentication`, opt-in, offered only when `hasHardwareAsync &&
  isEnrolledAsync`; `faceIDPermission` set; cold start and after 5 min in background; the lock screen is a centred
  `fullScreenModal`; a native cover on `AppState` inactive so the app-switcher snapshot hides balances).
- [ ] SM2.5 Native share sheet for share cards (and save image), clipboard, `open-external` in SFSafariViewController /
  Custom Tabs; WalletConnect deep links for `/bridge` (after S14w; Reown project ID), returning to the app, with "Waiting for your
  wallet app… / Reopen wallet" and a timeout. The OS share sheet is system UI, outside the overlay rule.
- **Gate:** a real verdict push on both platforms from the notifier (TestFlight builds use production APNs), tap opens
  the market; X bind completes inside the app (after S11); biometric lock; a bridge-in started in the app and signed in
  a wallet app on the same phone (after S14w). **Rows:** MOB-05, MOB-06, MOB-07, MOB-10, L-19 (`/native-auth`), UX-09 (push).

### SM3 — Native account, phase B (after SM1 + S7; spikes X15–X17)
- [ ] SM3.1 X17: accounts SDK + viem on Expo 57 (`pnpm.peerDependencyRules.allowedVersions` for the `^55` peers;
  `react-native-get-random-values`, `MessageEvent` shim; subpath imports only — Metro doesn't tree-shake).
- [ ] SM3.2 `mobile/modules/hardware-keys` (Swift CryptoKit `SecureEnclave.P256.Signing`; Kotlin AndroidKeyStore EC
  P-256, StrongBox with TEE fallback; no biometric prompt per signature) + `src/account/keystore.ts` (DER → (r,s), low-s,
  `prehash: true`, viem `Account.from` custom signer, SDK `Keystore` interface); X15 on Moderato.
- [ ] SM3.3 Native passkeys: `react-native-passkey` + `src/account/passkey-adapter.ts` against our `/api/auth`
  (the SDK's `webAuthn()` doesn't pass `createFn/getFn`); X16 same address; `Provider.create({ adapter, accessKey: {
  keystores: { p256 } }, storage: secureMmkv })`.
- [ ] SM3.4 Injected provider: `src/account/inject.ts` (EIP-1193 over the bridge + EIP-6963 announce, rdns = bundle ID)
  + web connector `web/src/providers/wallet/connectors/shell-device.ts` (full Tempo caps; first row of the picker in the
  shell); native centred confirmation modal for root-signed sends (`presentation: 'transparentModal'`, fade; never
  `formSheet`), reproducing the web arm-modal grammar; MMKV `IntentStore`.
- [ ] SM3.5 Tap trading on hardware keys: the EventVault SESSION grant (S7 flow) goes to the hardware-key account; the
  phase-A browser session grant is revoked on upgrade; a TIP-1011 access key on the root from the same keystore signs
  routine sponsored actions under its limits.
- [ ] SM3.6 Tempo Wallet in the app via `accounts/mobileWebAuth` + `tempoWallet()` (our
  `web/public/.well-known/urpc/consumer.json` lists redirect `<bundle>:/auth`), announced as a second injected provider.
- **Gate:** on both phones: native passkey sign-in → the web address; deposit + grant to the hardware key (self-paid),
  ten sponsored taps with no prompt, a cap refusal, revoke → the next tap fails; Tempo Wallet connects and signs one tx.
  **Rows:** MOB-08, MOB-09.

### SM4 — Native hot paths and system surfaces (after SM3 + S4 + S7; stock/theme/launch/bridge rows after S15/S16/S17/S14)
- [ ] SM4.1 Native `settings.tsx` (app lock, push permission, build/variant, "Account settings" → web
  `/settings/account`) per D.10; the native screen register entries (`native-of: <web id>`).
- [ ] SM4.2 Native call flow: hero (price chart as one Expo DOM-component island reusing the web chart code; static
  props only, ticks pushed through `useDOMImperativeHandle`, batched), Up/Down ticket (the S4 ticket's structure and
  copy; 21st 16240 is a DOM component, so the native ticket reproduces the revamped web ticket rather than importing
  it), verdict, claim — `@cwf/markets` hooks (React as a peer) + the hardware session key; haptics per state (Android
  `performAndroidHapticsAsync`).
- [ ] SM4.3 Native portfolio (calls, vault, stocks, themes, launches, bridges), notifications centre, alerts; each row
  deep-links into the web screen for full detail.
- [ ] SM4.4 `expo-widgets` (stable since SDK 56): a Live Activity for an open call (countdown to lock and expiry, live
  price, verdict; the countdown is an auto-updating `Text date`, so pushes only carry state changes) with both the
  per-activity and push-to-start tokens registered; a home-screen widget (open calls + balance) from App Group data;
  the Android widget is proven separately (the docs cover iOS only) and tracked as its own row; the first build proves
  widget-extension provisioning and the App Group on the individual account.
- **Gate:** screenshot parity with the web route at 390 in both themes; a call placed natively settles and its Live
  Activity shows the verdict; the widget updates. **Rows:** MOB-11, MOB-12.

### SM5 — Store delivery (first external build once SM1's gate and M1 pass; then every milestone)
- [ ] SM5.1 Verify D34 on web and app (built in S13): `/privacy`, `/terms`, contact, reporting, blocking, AI consent,
  account deletion.
- [ ] SM5.2 App Store Connect: metadata, screenshots, App Privacy answers, age rating (18+: frequent simulated gambling),
  export compliance, review notes (D.9), latest agreements accepted; external group + public link; submit to Beta App
  Review with a live backend and faucet.
- [ ] SM5.3 Version stays 1.0, build numbers only; a new build after every milestone; a final build whose 90-day life
  covers judging (winners by Dec 5); the internal group always has the current build.
- [ ] SM5.4 Android APK per milestone (versionCode bump, checksum, QR on `/download`); note Android developer
  verification for certified devices in Brazil, Indonesia, Singapore and Thailand from Sep 30 2026 (free limited
  account covers 20 devices; ADB always works).
- [ ] SM5.5 `/download` (L-18) lists the TestFlight public link, the internal-invite path, the APK and PWA install; the
  submission text lists them.
- **Gate:** the public TestFlight link installs on a fresh Apple ID — or, if Beta App Review is pending or rejects,
  the rejection text goes into acceptance, the D.9 fix is resubmitted, and judges use internal TestFlight meanwhile; the
  APK installs on a fresh Android phone. **Rows:** MOB-13, MOB-14, L-18 (app); L-19 and Y-17 at the first
  SM5 run after SM4's gate.

### S18 — Owner-gated rows (each starts when its answer lands)
- A-2a idle yield (yield-bearing dollar, mainnet), Y-02/Y-18 builder fees, Y-05 mainnet funding (onramp, Stargate
  bridge-in, any-stablecoin deposit), Y-07 MPP-paid agent API, A-1b inverse position, other Y-rows per answer.
  **Rows:** A-2a, A-1b, N-08, Y-01…Y-13, Y-15, Y-18.

### S19 — Deploy train (after M1, each milestone, and final) (M4)
- [ ] Moderato redeploys per milestone with `history[]` in fragments (indexer keeps old addresses).
- [ ] Mainnet 4217 (owner's go): engine + products + vault + registries; Data Streams key + subscriptions; relay float;
  Safes (hand-over scripts); mirrors + adapters + lockboxes with explicit DVNs; real Stock Tokens bought on Robinhood
  Chain and locked (Q-008 eligibility + budget); pools on official v4; ERC-8004 agents; MPP wallet; `/status` all green.
- **Gate:** smoke drives on mainnet. **Rows:** mainnet evidence for all rows.

### S20 — Public story and submission (final after S19)
- [ ] Landing (both pillars equal; Agari landing), how it works, pitch, demo, docs site (shipped surfaces only),
  download (PWA + TestFlight public link + internal invite path + APK, from SM5), the app in the demo video; two videos
  (2–3 min pitch, ≤ 3 min demo), GTM/demand text, disclosure. Weekly update videos run every week from now (owner
  action). 21st starts (E.1 Landing row): 23414, 27082, 26891, 29870, 28155, 18216; docs sidebar 19371 uiable/sidebar-1
  opening as the right-edge panel on phones; `/download` 8291 + 8280 + `qrcode-generator`; `/pitch` ported from Masayume
  `52a86fc` `features/pitch` (the only post-pin web diff); `/pitch` and `/demo` in Learn/footer rather than the user More
  panel; `/privacy`, `/terms` reuse the docs layout. **Rows:** L-11, L-12, L-13, L-14, L-18, L-20, Y-06.

### S21 — Fidelity completion gate and coherence pass
- [ ] Every row Done / Blocked-with-resolution / Excluded-with-dated-owner-decision; route definition of done
  (MS §5.1) on every route; state/visual/responsive contracts (MS §5.2–5.6); honest-data audit; every flow end to end on
  both networks; a UX pass over every route and the app (the §2.5 gate, §2.4 flow targets on a real phone, §3.1 budgets
  on every route, component register complete, `21st review` clean); the owner's review. **Rows:** M-15, UX-10, UX-12 +
  final status of all rows.

## 7. Dependency graph and waves

```
S0 ─┬─ S1 ─────────────────────────────────────────── web parts: S14w, S15d, S16a-web, S17a-web
    ├─ S2 ── S3 ──┬── S4 (M1) ─┬─ S5*, S6, S8, S10.0/a–c (+S8 depth), S12a/b, S13*
    │             │            └─ S7 ─┬─ S9* ───────────────────────────┐
    │             │                   └─ S10d, S11                       │
    ├─ S3.5 ──────┴── (*S5, S9, S13, S16a need S3.5)                      │
    ├─ S14c ── (S3) S14o ── S15b–d (M2) ── (S4, S6) S15e ── S16a (M3) ◄───┘
    ├─ S15a ── S16c (after the money gate) ; S17b
    └─ S17a
S1 (+domain) ── SM1 ─┬─ SM2 (push topics follow S3/S4/S7/S9/S11/S12b/S13/S14/S16/S17; auth with S11; bridge-in with S14w)
                     ├─ SM3 (after S7) ── SM4 (after S4, S7; stock/theme/launch/bridge rows after S15/S16/S17/S14)
                     └─ SM5 (first external build after SM1 + M1; then every milestone)
all ── S18 (as answers land) ── S19 (M4; also after each milestone) ── S20 ── S21
```
- **Wave 1 (4 agents):** S1 · S2 · S14c · S15a + S17a (one agent). S3.5 joins when S1's lane 1a frees.
- **Mobile lane:** SM1 takes the S1 agent's lane after S1's gate (native work needs the web shell and the domain); SM2's
  notifier and SM3 run in that lane as their dependencies land; SM5 repeats at every milestone.
- **Money gate:** no financial contract stage (S7, S8, S10, S12b, S16c, S17b) before S2's invariants, deadline races
  and Moderato drive rows exist. S2.1's ABI tag lets those stages write code earlier; their tests need S2.6.

## 8. Owner questions and owner actions

**Q-table** (in `docs/plan/decisions.md`; defaults apply until answered; none is a scope cut):

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
| Q-019 | Product name, **domain** (passkey rpId) and the pitch | — (domain needed before S0's gate; S0 falls back to the Vercel URL and the domain check moves to S1's gate) | S0, S1, S20 |
| Q-020 | Capped mainnet MPP wallet (USDC.e) for agents | None until approved (decisions labelled "unpaid") | S3.5, S9, S16a |
| Q-021 | Also sponsor `EventVault.place` / `moveToPrivate` | Unchanged from Masayume's list (not sponsored) | S7 |
| Q-022 | Engine deviations T01–T10 (A.7), incl. redeem auto-drains own orders, `UnknownRedStoneSigner` vector change, PD-2 knock-out rule for Boost | As designed | S2.1, S10c |
| Q-023 | Mirror naming | "Bridged TSLA Stock Token (unofficial)" / `bTSLA`, own lettermark logo | S14c |
| Q-024 | StockGuard off-hours mode and bands | WIDEN (24/7 at pool price); 150/300/500 bps | S15b |
| Q-025 | Theme creator fee cap | 50 bps | S16c |
| Q-026 | Hosting providers | Vercel, Fly, Neon, Upstash | S0 |
| Q-027 | App name, bundle IDs, URL scheme | `<reverse-domain>.app` (mainnet, later) / `<reverse-domain>.app.testnet`; scheme = the bundle ID; name from Q-019 + "Testnet" | SM1 |
| Q-028 | Geofence inside the testnet app for App Review (a US reviewer would see browse-only markets) | Same posture as the web, explained in the review notes with a reviewer walkthrough | SM5 |
| Q-029 | Convert the Apple account to an organization (legal entity + D-U-N-S, ~2–3 weeks) for a later public or unlisted listing and the mainnet build | Stay individual; TestFlight only | after S21 |
| Q-030 | Ask Colosseum whether judges install apps and whether judge emails can be shared for internal TestFlight | Ask now (agent drafts); public link + internal path both kept ready | SM5 |
| Q-031 | Wallet-mode access key defaults (D38): daily limit and expiry | Masayume's session defaults: $25/day, 24 h, renewable in one tap | S4 |

**Owner actions** (dated list in `docs/plan/owner-actions.md`): domain + hosting accounts (S0); start daily Robinhood
testnet faucet claims (S0, X11); approve and fund the capped MPP wallet (before S3.5); passkey device checks (S1, S4 on a
NYSE date, S15, S16); X account (before S11); send the LayerZero direct-pathway request (S14c day 1, agent drafts);
Data Streams subscription + testnet credential request (before S19); eligibility/budget and Safes (before S19); retire
the laptop RedStone archiver after S0.11 overlap; weekly update video (every week from now).
**Mobile owner actions:** Expo account (EAS); App Store Connect app record for the testnet bundle and the latest
agreements accepted (SM1); internal TestFlight group + App Store Connect users for testers and judges (up to 50 extra
users on an individual account; invites expire after 3 days); APNs auth key `.p8` (max 2 per account) (SM2); Firebase
project + FCM service account + `google-services.json` for Android push (SM2); Reown (WalletConnect) project ID (SM2);
an Android phone for device checks; iPhone device checks at SM1, SM2, SM3, SM4; App Privacy, age-rating and
export-compliance answers approved (SM5); send the Colosseum question (Q-030).

## 9. Verification

- **Per stage:** `pnpm typecheck && pnpm invariants && pnpm test && pnpm codegen:check`; `pnpm build`;
  `forge build --sizes && forge test` (both profiles; invariant suites; Tempo precompiles with `network = "tempo"`);
  `scripts/drive/<stage>.ts` on Moderato with every tx `cast receipt`-verified into `acceptance/S<n>.md`; relay-policy
  checks; browser pass at 390/768/1440 (+320) in both themes against the Masayume route; passkey runs via Playwright +
  CDP virtual authenticator, then the owner's device where the gate says so. Gate commit `docs(plan): S<n> gate passed`
  advances parity rows.
- **UX and performance:** the UX gate (§2.5) at every UI stage; Lighthouse CI + `next experimental-analyze` budgets
  (§3.1) in CI; `21st review` + `@axe-core/playwright` on changed routes; screenshots at 390/320/768/1440 in both themes
  compared against Masayume's routes for identity; the §2.4 flow targets timed on a real phone (prompts counted, tap →
  Call card latency); Vercel Speed Insights p75 after each deploy.
- **Money correctness:** Agari's randomized properties in Foundry (engine); conservation invariants per product (vault,
  maker, reserves, desk, arena, curve, router, bridge); gas tables under Tempo pricing (Foundry ≥ 1.8.3).
- **Cross-chain:** real messages Robinhood testnet → Base Sepolia → Moderato and back, then mainnet direct; reserves
  reconciled on both explorers.
- **Mobile:** `pnpm --filter mobile typecheck test` (bridge protocol schemas shared with the web; keystore DER/low-s
  vectors); `scripts/mobile/check-associated-domains.ts`; Maestro flows on the iOS simulator and an Android emulator
  (launch, every tab and More row, deep link, share, offline screen); EAS builds per profile; the owner's device checks
  at each SM gate (passkey same address, sponsored tx, push received and opened, universal link, biometric lock,
  hardware-key taps, Live Activity); every device tx `cast receipt`-verified into `acceptance/SM<n>.md`.
- **Final (S21):** every flow end to end on the deployed app on both networks — call, tap trade, copy an agent,
  parlay/range/boost/private, Earn, a duel, trade from X, bridge a Stock Token, buy a stock, follow a theme and watch a
  rebalance, launch a stablecoin and graduate a memecoin — with the owner's review.

## 10. Top risks

| Risk | Mitigation |
|---|---|
| Engine gas on the 30M general lane | Recycled nodes, 2-slot positions, credits from redeems, `reserveNodes`; X7 + S2.10 measure; bounds are parameters; recycled-Book contingency recorded |
| Engine interface misses a seam need → redeploy invalidates later evidence | Signed interface checklist before freeze; views in the redeployable `EngineLens`; ensure-style deploys fail on drift |
| Receive-policy blackhole / TIP-403 freeze | P12 pre-checks; `redeemFor` holds as credit; `_payOrOwe`; bridge defers; real-precompile tests + Moderato fork test |
| Testnet bridge hop untested | X1 on day 1; composer self-funding; direct-pathway request + Wormhole probe in parallel |
| Bridge trust root (Safe/DVN config) can mint unbacked | Inbound rate limit + supply cap (defers), `CheckLzConfig`, reserve-watch alerts, disclosure |
| Issuer powers over locked Stock Tokens | Live `/reserves`, `LOCKBOX_BLOCKED` flag, unlock deferral + resend |
| Follow grant over 16M gas | X4 first; split with `setAllowedCalls` |
| Injected wallets can't sign 0x76 | Capability flags; sequential path; `setUserToken`; X8 |
| Relay `validate` runs twice / serverless counters | Debit only on raw-send; Postgres ledger with per-sender lock |
| Hosting, domain and owner actions not ready | S0 owns them; dated owner-actions list; Q-019/Q-026 |
| RedStone ~24 h retention | Archive takeover in S0 + import + overlap |
| Liquidity (our makers and pools are the only depth) | Seed maker from S3; S8 before S10/S12b gates; house-seeded pools + bid ladder; honest depth |
| Merge conflicts across parallel agents | Fragments, one integrator, dependencies installed in S0 |
| 21st components carry weight, hard-coded colours or weak a11y | D35 recipe; `21st review` + axe per step; budgets in CI; picks already screened (21st-map); compose where coverage is weak |
| Revamped screens drift from Masayume's identity | `packages/tokens` is the only colour/spacing source; screenshot comparison against Masayume at 390; owner review at S21 |
| Next 16 `cacheComponents` vs wagmi's cookie SSR recipe | Cookie read inside a Suspense-wrapped provider (D41); caught at the S1 build |
| Access-key limits may not cap approve-in-batch as expected | X20 before D38 ships; the Trading Balance path works regardless |
| Accounts SDK moving the relay to `tapimo` (0.19) | Pinned `~0.18.4`; migration by a later D-entry |
| Beta App Review flags the app (3.1.5(i) wallet from an individual, 3.1.5(iv) stock tokens, 3.2.2(viii) binary-option-like calls, 5.1.1(ix), 4.2 web wrapper) | Internal TestFlight needs no review and is ready from SM1; testnet-only build; native presence (tabs, passkeys, push, haptics, Live Activity, widget, biometric lock); D34 obligations; precise review notes (D.9); resubmit on rejection; nothing removed from the app |
| Passkeys fail inside the web views | X13/X14 on day one of SM1; associated domains served without redirects and checked against Apple's CDN; Android origin added to `Handler.webAuthn`; fallback native passkeys (SM3) |
| Accounts SDK RN path tested only on Expo 55 (peers `^55`, nitro `^0.35`) | X17; peer overrides; subpath imports; phase A doesn't depend on it |
| AppKit RN's wagmi adapter needs wagmi < 3 | Bridge-in stays in the web view with WalletConnect deep links (X18) |
| Web view killed under memory pressure | One web view (D27); `onContentProcessDidTerminate` reload; state restored from the web app's persisted stores |
| Toolchain: uploads need Xcode 26 / iOS 26 SDK (since 2026-04-28) | EAS build image with Xcode 26 (SDK 57 default); checked in X19 |
| TestFlight builds expire after 90 days | Upload a final build late enough to cover Dec 5; internal group always current |
| Android developer verification (Brazil, Indonesia, Singapore, Thailand from Sep 30 2026) | Free limited account (20 devices) or ADB install documented on `/download` |

---

## Critical files (sources to open first)

- Agari engine: `/Users/abu/dev/hackathon/agari-wt/w1/anchor/programs/agari-events/src/matching/{place,engine,paths,evict,orders,redeem}.rs`, `.../matching/tests/{random,support}.rs`, `/Users/abu/dev/hackathon/agari-wt/w1/anchor/crates/agari-common/src/print/{redstone,normalize,median}.rs`, `anchor/tests/vectors/prints/`
- Masayume contracts: `/Users/abu/dev/hackathon/sommina-events/contracts/src/{vault/EventVault.sol, vault/VenueGateway.sol, maker/MakerGateway.sol, leverage/LeverageGateway.sol, private/PrivateGateway.sol, games/ArenaGateway.sol, parlay/ParlayPricing.sol, range/RangePricing.sol}`, `contracts/test/**`
- Masayume app: `/Users/abu/dev/hackathon/sommina-events/packages/core/src/ports/markets-provider.ts`, `packages/markets/src/**`, `web/src/**`
- Agari app/ops: `/Users/abu/dev/hackathon/agari-wt/w1/web/src/providers/wallet/*`, `web/src/proxy.ts`, `services/ops/src/runtime/actor.ts`, `packages/markets/src/sponsor/gates.ts`, `packages/db/src/schema-index.ts`
- Tempo: tempo-std `src/interfaces/{ITIP403Registry,IAccountKeychain,IStorageCredits}.sol`; accounts `src/server/internal/handlers/{relay,webAuthn}.ts`, `examples/fee-payer-and-webauthn/worker/index.ts`
- Research: `context/tempo/{13,14,15,16}-*.md`; `context/tempo/research-2026-09-29/*` (UX audit, 21st map, library
  docs); architecture `17-architecture.md`; ledger `12-parity-ledger.md`
- Mobile: Masayume `web/src/components/shell/header/MobileBottomNav.tsx`, `web/src/styles/navigation.css`,
  `web/src/features/install/*`, `web/public/manifest.webmanifest`, `packages/core/src/urls/app.ts` (deep-link helpers);
  Yosuku `reference/yosuku/app/native-auth/page.tsx`, `reference/yosuku/public/.well-known/apple-app-site-association`;
  accounts `src/core/adapters/{webAuthn,mobileWebAuth}/*`, `src/core/Keystore.ts`, `src/react-native/secureMmkv.ts`,
  `playgrounds/react-native/{App.tsx,polyfills.js}`; viem `tempo/Account.ts` (`fromWebCryptoP256`)

Appendices live in `docs/specs/`: engine.md (A), pillar2.md (B), offchain.md (C), mobile.md (D), ux.md (E), v4-replay.md (B.3.1).
