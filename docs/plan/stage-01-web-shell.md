# S1 — Web shell, accounts, relay, geofence (wave 1)

- [x] 1a core: port Masayume `packages/core/src/**` minus Somnia modules (C.2.1 list); add Agari
  `packages/core/src/{market,orders,reserves,auth,types/session-lanes}`; types per C.2.1 (drop poolAddress/nonce/token
  ids/venueId; `MarketStatus` clock-derived); calendar = RedStone `NY_MARKET_NEXT_CHANGE_TIME` ∩ Alpaca; tickers 9 names +
  SPCX + BTC/ETH/SOL; stubs `stocks/ bridge/ themes/ launch/` with vectors.
- [x] 1a markets surface: `packages/markets/src/{chains,env,deployments,errors,runtime,tx,sessions,submitter,relay,auth,
  faucet}` (C.2.4); provider answers `Reading` "not deployed" per area; journal with `validBeforeSec`. Package exports
  split from day one: `@cwf/markets` (browser/native-safe), `@cwf/markets/server` (relay, auth verify, faucet, mpp,
  indexer API, signing with server keys), `@cwf/markets/react`; `IntentStore` adapters (memory, localStorage; MMKV added
  in SM3); randomness via `crypto.getRandomValues` only (polyfilled on native).
- [x] 1b tokens + design base: `packages/tokens` from Masayume's CSS variables (§2.2) with a check against the ported
  styles; Tailwind 4 `@theme inline` + trading tokens; `next/font`; `LazyMotion` + `MotionConfig`; Base UI; spike X23.
- [x] 1b shell: port Masayume `web/src/{app/layout.tsx, components/**, styles/**, providers/{AppProviders,MarketsBoot,
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
- [x] 1b onboarding (D37): the one-ceremony centred modal — passkey create/sign in (21st 19045 layout; 20041's flow
  without its bottom drawer) → server faucet funds without a user signature → land on `/markets` (the ticket and its remembered
  stake attach in S4); the modal has a slot for the arm step, filled when its target exists (wallet access key in S4 once the engine
  is deployed; Trading Balance arm in S7 once EventVault is); contextual first-use explainers replace the 5-step
  tutorial (Masayume `features/onboarding` copy reused where it still fits).
- [x] 1b transactions: `web/src/components/tx/*` — the `TxLifecycle` family (D43): state machine in
  `packages/core/src/tx/lifecycle.ts` (pure, tested), CTA-with-blocker, signing/submitted/confirmed chips, failure card
  with "moneyMoved", cream receipt (Masayume), "key used" receipt, confirm tiers, journal hooks.
- [x] 1b wallet: `web/src/providers/wallet/*` per C.3.1 (Agari replica file-by-file, wagmi 3 names per D46; wallet-picker
  layout from 21st 8588, centred); `lib/wallet-session.ts`; `UserSessionProvider` with memoised, split context values (no
  per-second re-render); wrong-network banner mounted; two-wallet model (Tempo + Robinhood Chain + Base Sepolia);
  capability flags come from the connector (so SM3's `shellDevice` connector can declare full Tempo caps); the connector
  config carries the `accessKey.authorize` hook, activated in S4 when the engine address exists (D38); phone picker never
  dead-ends in mobile Safari (passkey first, WalletConnect listed).
- [x] 1b `/settings/account` shell (D44): passkey devices; the live keys/grants list reading AccountKeychain + vault
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
- [x] 1c routes: `/api/auth/[...path]` + `server/{kv,session}.ts` (C.3.2); `/api/relay` + `/api/relay/status` with a
  `noop` area (C.3.3); `/api/faucet{,/challenge}` (C.3.4); `packages/db/migrations/{relay,faucet}/0001_*.sql` run on both Neon
  databases; `web/src/proxy.ts` + `lib/region-mark.ts` per-pillar
  geofence (C.3.5; Q-008 default); spikes X8, X9.
- **Gate:** `pnpm build`; browser pass on every Masayume route (390/768/1440 + 320, both themes, 0 console errors) with
  the UX gate (§2.5); budgets (§3.1) green on landing and `/markets` shell; one ceremony from a fresh passkey to a
  funded account (virtual authenticator, then the owner's device); sponsored no-op with fee payer = relay, another
  selector refused; `x-vercel-ip-country: US` → 451 on a funded route, exits open. **Rows:** L-01…L-10, L-18, L-21, L-24, L-25, L-72, L-74, M-09, M-10, M-12, M-13, N-01, N-02, N-12, G-11, UX-01, UX-02, UX-03, UX-07 (shell), UX-10, UX-11.

## Findings

- **1a core — identities S2 must share.** `packages/core/src/market/tickers.ts` fixes the engine's `uint16 ticker`
  numbers (TSLA 1 … AMD 9, SPCX 10, BTC 101, ETH 102, SOL 103) and `types/market.ts` fixes the `uint8 basis` order
  (`regular` 0, `gap` 1, `crypto24` 2, `stock24` 3) and the print-source numbers (RedStone 2, Attested 4, Data Streams
  5, engine A.1.2). S2.11's `venue-spec.json` and `RegisterSeries` must read these, not restate them.
- **1a core — sources.** Agari (03b30ab) supplies `lifecycle/` too: its `market/` depends on the lock-aware phase
  (`lockAtSec`, `isStalledOpening`). Agari's Solana-only modules are not carried: `pyth-schedule` (replaced by
  `redstone-schedule.ts`, the `NY_MARKET_NEXT_CHANGE_TIME` ∩ Alpaca agreement), `baskets`, `valuation`, `premium`,
  `testing/ids` (base58; replaced by `testing/fixtures.ts`). `book.vectors.json` is Agari's slot-based file, kept until
  S2.8 regenerates it in seconds.
- **1a core — halts.** Pyth/Switchboard/issuer signals become RedStone freshness + signer count, Data Streams freshness
  + `marketStatus`, and the exchange's tradable flag; "Trading halted" only for the exchange halt or a closed-market
  report (Q-S6-9 grammar kept).
- **1a markets — accounts pin.** `accounts@0.18.5` (the newest 0.18.x) was published with an unresolved
  `hono@catalog:` dependency and cannot install; the catalog pins `accounts: 0.18.4` exactly (C.1.3 said "exact pin").
- **1a markets — Redis client.** D-061 replaces Upstash with Coolify Redis over TCP, so the catalog gains `redis`
  (node-redis 6): `SET NX` for `Kv.create`, `GETDEL` for `Kv.take`, native `EX` TTLs. `server/kv.test.ts` proves the
  atomic take against a real throwaway `redis-server` (skipped where none is installed). Passkey credentials live only
  in this KV (`credential:*` → public key), so the Coolify Redis must persist (AOF) — an owner/integrator check.
- **1a markets — relay no-op.** The `noop` area is Multicall3 `getCurrentBlockTimestamp()` (a view: moves nothing);
  `aggregate*` are `never` (they could run arbitrary calls). Access-key revocation is its own `keys` area: sponsored
  and never geofenced (an exit).
- **1a markets — journal without a hash.** A sync send that times out has no hash. Past its `validBeforeSec` an
  expiring-nonce record is "absent" only when the area's own evidence says so; otherwise it stays "unknown" until the
  24 h expiry (never re-sent). Area evidence readers join with their areas (engine in S4).
- **1a — geofence header on Coolify.** Coolify's proxy stamps no country header (`x-vercel-ip-country` is Vercel's).
  `core/region` trusts `cf-ipcountry` then `x-vercel-ip-country`; with neither, the posture is open (Agari's rule).
  Enforcing Q-008 on the live domains needs a country header in front of Coolify (e.g. Cloudflare proxying
  `mitoshi.xyz`) — added to the owner actions with the DNS step.
- **1b tokens — light accent.** Masayume's light theme flips vermilion to `#D93E1F` (pressed `#B83214`) with the
  cream ramp (yosuku part-13); `docs/design/{DESIGN.md,design.json}` said "same" and are corrected from `tokens.json`,
  which a test checks against the ported Yosuku parts and a verbatim copy of Masayume's `bridge.css`.
- **1b tokens — accent as text.** Vermilion small text fails AA (4.48:1 on dark surface-1, 3.97:1 on light): accent
  is for fills, borders, underlines and large text; small labels use ink (applied in the X23 ticket's "Max").
- **1b tokens — fonts.** Only Sora and Inter preload (≤ 2 preloads, §3.2); JetBrains Mono and Noto Serif JP load on
  use (`next/font/google` has no glyph-subset option; the JP face stays latin-subset with CJK by unicode-range).
- **1b shell — pathname reads.** With `cacheComponents`, `usePathname()` outside Suspense blocks the static shell of
  every dynamic route, so the header reads the path inside a Suspense boundary (the prerendered shell has no active
  item) and the island route (`/trade-from-x`) is its own route group instead of a pathname check.
- **1b shell — unlayered Yosuku rules.** Yosuku's `a { color: inherit }` and `.capability-pending { padding }` are
  unlayered, so they beat Tailwind utilities: colour utilities on links use `!` (Agari did the same) and the shell's
  overrides live in `styles/shell-fixes.css`, after the verbatim port.
- **1b shell — contrast.** Yosuku's white-on-vermilion buttons (3.9:1) and gray-500 small text (4.2–4.3:1) fail AA;
  `@cwf/tokens` adds the fill pair `--accent-fill`/`--on-accent` (dark: vermilion + cream-ink 4.7:1, Masayume's own
  `--button-primary-ink`; light: pressed vermilion + cream 5.6:1) and the shell's small text uses gray-400. Every
  later stage's gate run will find the remaining gray-500 small text on its own surfaces (the Yosuku sheet is global).
- **1b shell — phone fast paths.** The pill nav is Markets · Stocks · Games · Portfolio · More (Masayume: Markets ·
  Reels · Games · Portfolio): both pillars are first-class (E.1 landing note); Reels is the first More row and a
  desktop top link. Desktop gains a Stocks group (Stocks, Themes, Bridge, Reserves); Launch sits in Build.
- **1b shell — CSS split.** The 40 feature `@import`s are gone from the global sheet (each feature imports its own);
  the verbatim Yosuku system stays global (≈ 540 KB unminified in dev). Its size is measured by the perf step.
- **1b shell — 21st starts still to land.** 24857 + 1600 (account pill) land with the wallet; 23552 (segmented
  control) and 23557 (skeleton swap) with the settings surface; 24297 (toast) and the 27109/21349/19177 header and
  active-pill techniques are applied where those surfaces are next touched in this stage.
- **1c — relay against Moderato (D-070).** Three things the plan did not know, all measured through our own relay: (1)
  accounts 0.18.4 attaches the fee-payer signature to the *fill* result and the client sends the raw tx straight to
  the RPC, so budgets are debited on every co-signing method (`SIGNING_METHODS`), not only raw sends; (2) Moderato's
  sponsored `eth_fillTransaction` fails ("gas required exceeds allowance (0)") if the request already names any fee
  field, so a sponsored `sendBatch` leaves fees to the sponsor; (3) a new account's fill estimates TIP-1000's 250,000
  gas of account creation, so the engine adds exactly that to the area cap while the sender's pending nonce is 0
  (execution used 34,257). Also: viem encodes a zero `value` as `"0x"`, which `BigInt()` rejects — the parser reads it
  as 0 and the validator now refuses (code `malformed`) instead of throwing.
- **1c — relay status carries verdicts.** `/api/relay/status` adds `recent` (this process's last 20 verdicts: method,
  ok, refusal code — no senders). viem reports a refused sponsorship as a generic "Invalid parameters"; the gate script
  reads the rule that refused from here, and S5's status page gets refusals for free.
- **1c — faucet.** `tempo_fundAddress` sends 1,000,000 of each of pathUSD/AlphaUSD/BetaUSD/ThetaUSD (`0x20c0…0`–`…3`)
  in four transactions. Quotas live in Postgres (`faucet_claims`), the challenge is one-time (`update … returning`).
  The passkey path needs no signature (the `Handler.webAuthn` session proves the address, D-046); wallets sign an
  EIP-191 challenge verified by `messageVerifier`, so X9's conformance covers it.
- **1c — `@cwf/db` under Turbopack.** `import.meta.dirname` is undefined in the Next server bundle, so the migration
  runner's module-level path crashed every route importing the stores; the path resolves on use (the web process
  never migrates — the deploy step runs `pnpm --filter @cwf/db migrate`).
- **1c — X8 injected wallets on Tempo (measured).** `eth_getBalance` returns the same placeholder
  (4242…42, ~4.2 × 10⁷⁵) for every address, funded or not: an injected wallet's native-balance precheck always passes
  and its native balance display is meaningless — the UI never reads native balance (only TIP-20 sheets). Plain
  EIP-1559 (type 2) and legacy (type 0) transactions land; the fee is taken in pathUSD from the sender (no preference
  set): 30,926 gas → 50 µ$ at 1.6 gwei effective (type 2), 155 µ$ at a 5 gwei legacy `gasPrice` (legacy pays its full
  price). Such transactions can't batch, can't be sponsored (sponsorship needs 0x76) and can't use expiring nonces —
  exactly `INJECTED_CAPS`. Note: `cast` 1.8.3 is Tempo-aware and silently rewrites a "type 2" `cast send` into 0x76
  ("Paying gas in PathUSD"), so injected behaviour must be measured with a standard serializer, not `cast send`.
- **1c — X9 verify conformance (measured).** `messageVerifier` (viem `verifyHash`, local) and Moderato's
  `SignatureVerifier.verify` (`0x5165…`) agree on all nine cases: secp256k1 (65 B), P-256 (130 B) and WebAuthn (300 B
  envelope) × valid / tampered hash / wrong signer (`pnpm --filter @cwf/markets test:live`). Access-key
  (`verifyKeychain`) conformance needs an authorised key on chain and lands with S4's first key.
- **1c — passkey RP name.** accounts 0.18.4 sets `rp.name` to the RP ID (`webAuthn.ts:118`), so the OS prompt names
  `mitoshi.xyz` rather than "Mitoshi". Browsers lead with the RP ID anyway; not patched (would fork the pinned SDK).
- **1b onboarding — fund, then answer.** `tempo_fundAddress` returns hashes before inclusion; answering "funded" then
  made the receipt read $0.00. `/api/faucet` now waits for the four receipts (~0.5 s) before it answers, so the figure
  is the balance actually read afterwards. Known refusals (the daily cooldown, a held region) come from
  `GET /api/faucet?wallet=` when Add money opens, so the dialog never offers a button that would fail.
- **1b onboarding — arm slot.** `features/onboarding/arm-steps.ts` is an empty registry: S4 registers the wallet access
  key step once the engine is deployed, S7 the Trading Balance arm once EventVault is. The ceremony renders nothing for
  it until then (no step that can't complete).
- **1b onboarding — header pill on phones.** Masayume's ≤ 420 px rule hides the wallet pill's *last* span; our port
  ends in a chevron, so the address wrapped onto two lines. `shell-fixes.css` names the address and chevron.
- **1b settings — keys come from events.** The AccountKeychain can't enumerate keys, and Moderato caps `eth_getLogs` at
  100,000 blocks, so `/api/keys` scans the account's keychain events (one filtered query per window; every event indexes
  `account` first) and keeps a contiguous scanned range per account in Postgres (`keys/0001_keychain_scan.sql`). The
  first visit takes ~40 s across polls with keys shown as found and a "checked back to <date>" line; later visits scan
  only new blocks. The Tempo Indexer API would answer in one query, but it is MPP-paid (402; 0.0001 pathUSD per query on
  Moderato), and the MPP client is S3.5's — S5 can switch `/api/keys` to it or to its own follower.
- **1b settings — keychain facts (measured).** Moderato retired the legacy 5-argument `authorizeKey` (reverts
  `LegacyAuthorizeKeySelectorChanged`, new selector `0x980a6025`: `(keyId, type, KeyRestrictions)`); authorising emits
  `KeyAuthorized` but no `SpendingLimitUpdated`, so initial limits are decoded from the authorising transaction (a
  `calls` entry or the inline `keyAuthorization`); a revoked key reads `expiry = 0` from `getKey`. viem's Tempo chains
  omit Multicall3 though it is deployed at the canonical address on both networks — `tempoChain` now declares it.
- **1b settings — wallet actions on the connector client.** wagmi's `useConnectorClient` returns a bare viem Client;
  `sendBatch` needs `sendTransactionSync`, so the session binds `client.extend(walletActions)` (first real send from
  the page: the revoke).
- **1b settings — `key-revoke` takes 1–8 key ids** (one sponsored transaction within the relay's call cap); revoke-all
  chunks by 8.
- **1b settings — e2e key authorisation.** Until S4 authorises keys from the UI, `@cwf/markets/testing` rebuilds the
  virtual authenticator's credential headlessly (same passkey account) and authorises a real key; it lives in markets
  because only markets may import `viem/tempo` and send.
- **Order within the stage.** Onboarding needs the wallet connector and the auth/faucet routes, so the steps land as
  transactions → wallet → 1c routes → onboarding → settings → perf → real-time (sequencing only; every box lands).
- **1b wallet — no cookie read on the server.** wagmi's `cookieToInitialState` would read `headers()` in the root and,
  under `cacheComponents`, make every app route dynamic. The shell renders "signed out" on the server and restores a
  remembered connection after hydration (≤ 3 s, Agari's pattern), with `ssr` + cookie storage — no hydration mismatch.
- **1b wallet — Agari's modal was a RainbowKit bottom sheet on phones.** The sign-in modal is centred on every screen
  (owner rule) and lists the passkey first, so a phone never dead-ends (WalletConnect listed; without a Reown project
  id the row says it isn't configured — `WALLETCONNECT_PROJECT_ID` is an owner/integrator value).
- **1b wallet — access key.** The `accessKey.authorize` hook is wired and returns nothing until an `engine` fragment
  exists; S4 swaps the scope names for full signatures from the generated engine ABI (D-047, Q-031 defaults).

## Handoff

_Not started._
