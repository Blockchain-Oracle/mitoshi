# Libraries — how each one is meant to be used here

"Understand the libraries" = read their docs (Context7 first; the vendor's docs when Context7 is unavailable) and build
on the recommended patterns. The detail and citations live in `context/tempo/research-2026-09-29/`; the decisions they
forced are D-054…D-056 (plan D45–D47). Before coding against a library, re-read its section and cite it in the step.

| Library (pinned) | Notes | Decisions that follow |
|---|---|---|
| Next.js 16.3 | `web-stack.md` §1, `open-libs.md` §6 | `cacheComponents`, React Compiler (Babel), `partialPrefetching`, `agentRules: false`, `loading.tsx` per dynamic segment, cookie reads inside Suspense, `proxy.ts` on Node, `preload` not `priority`, `connection()` for per-request route handlers |
| React 19.2 | `web-stack.md` §2 | `useEffectEvent` for stream subscriptions, `startTransition`, `<Activity>`-kept pages reset their state |
| TanStack Query 5 | `web-stack.md` §3 | one QueryClient shared with wagmi; RSC prefetch + dehydrate pending; stream writes via `setQueryData`; `staleTime: Infinity` for prices |
| wagmi 3 + viem 2.56 (`viem/tempo`) | `web-stack.md` §4, `open-libs.md` §5 | `useConnection` names; `withRelay`; `sendTransactionSync`; expiring nonces set explicitly on taps |
| Tempo accounts SDK ~0.18.4 | `web-stack.md` §5, `mobile-stack.md` | handlers at module scope; Redis KV with atomic `take`; `accessKey.authorize`; relay moves to `tapimo` in 0.19 (later D-entry) |
| lightweight-charts 5.2 | `web-stack.md` §6 | client-only, `autoSize`, `series.update` per tick outside React |
| motion | `web-stack.md` §7 | `LazyMotion(domAnimation)`, `m.*`, `MotionConfig reducedMotion="user"` |
| Tailwind 4 + Base UI 1.8 | `web-stack.md` §8, `open-libs.md` §1 | semantic tokens via `@theme inline`; Drawer `swipeDirection="right"`; Radix→Base mapping for 21st picks |
| @number-flow/react | `open-libs.md` §2 | headline figures only; `animated={false}` in dense lists |
| pnpm 11 | `open-libs.md` §3 | settings in `pnpm-workspace.yaml`, `allowBuilds`, named `mobile` catalog, no root react `resolutions` |
| Lighthouse CI | `open-libs.md` §4 | `screenEmulation` 390×844, median of 3, Vercel preview via `repository_dispatch` + bypass headers |
| Foundry 1.8.3 | `chain-libs.md` §1 | `network = "tempo"`, gas snapshots + `--gas-snapshot-check`, `afterInvariant`, Sourcify verify at `contracts.tempo.xyz`; scripts target a Tempo node |
| OpenZeppelin 5.7 | `chain-libs.md` §2 | proxy initialized at construction (own ProxyAdmin), `_disableInitializers()`, transient guard |
| OZ uniswap-hooks, v4-core/periphery | `chain-libs.md` §3–4 | `BaseHook`; `sync` → transfer → `settle`; pinned router ABI; off-chain quoter only. UR `0xa2dc` ABI = periphery #497 (5-field single, per-hop max-price array on multi; D-064), encoder `@cwf/markets/v4` only |
| LayerZero V2 (npm) | `chain-libs.md` §5 | `_debit`/`_credit` overrides; enforced options; `_credit` never reverts; needs `solidity-bytes-utils` |
| Solady 0.1.26 | `chain-libs.md` §6 | `ffs/fls(0) = 256` guards; `lnWad` refuses ≤ 0 |
| Expo SDK 57 + RN webview, notifications, widgets, EAS | `mobile-stack.md` | Appendix D as corrected by D-056 |
