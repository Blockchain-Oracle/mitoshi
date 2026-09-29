# S1 — Web shell, accounts, relay, geofence (wave 1)

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

## Findings

_None yet._

## Handoff

_Not started._
