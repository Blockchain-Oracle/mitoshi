# Web stack: library documentation study (for the build plan)

Date: 2026-09-29. Scope: how each library is meant to be used, what its docs say about performance, and what that means for our app. This is not a dependency or supply-chain review.

Product context: a Next.js App Router web app (also loaded inside a single WKWebView on iOS/Android) for prediction markets and tokenized stocks on Tempo (chain 4217 mainnet, 42431 Moderato testnet). Passkey sign-in (WebAuthn P-256), batched calls with a sponsored fee payer, live prices, "tap to trade". Targets: phones on 4G, LCP < 2.5 s, INP < 200 ms.

Sources:
- Context7 library IDs used: `/vercel/next.js/v16.2.9` (newest Next version indexed; we plan 16.3.x), `/react/react/v19.2.7`, `/websites/react_dev_reference`, `/tanstack/query/v5.90.3`, `/wevm/wagmi`, `/wevm/viem`, `/tradingview/lightweight-charts/v5.2.0`, `/websites/motion_dev`, `/shadcn-ui/ui`, `/websites/tailwindcss`.
- Tempo accounts SDK: cloned `github.com/tempoxyz/accounts` to `scratchpad/repos/accounts` (HEAD 54cd8bb, 2026-09-28, which is **0.19.0**). A worktree of tag `accounts@0.18.4` is at `scratchpad/repos/accounts-0.18.4`. Accounts file paths below point at the 0.18.4 worktree unless marked HEAD.
- Tempo docs on disk: `/Users/abu/dev/hackathon/crypto-world-fair/reference/tempo-docs-md/`.

Short names for the paths used in citations:
- `ACC` = `/private/tmp/claude-501/-Users-abu-dev-hackathon-crypto-world-fair/86cc565d-9d7b-474e-a8f8-af9627b83f69/scratchpad/repos/accounts-0.18.4`
- `TDOCS` = `/Users/abu/dev/hackathon/crypto-world-fair/reference/tempo-docs-md`

`[I]` marks my own inference. Anything without `[I]` is cited.

---

## 1. Next.js 16 (App Router)

### 1.1 Recommended patterns

**Cache Components, `use cache` and PPR.**
- Turn it on with `cacheComponents: true` in `next.config.ts`. After that, data fetching is dynamic by default and you opt in to caching at page, component or function level with `'use cache'`. Next prerenders a static HTML shell, serves it immediately, and streams the dynamic parts in. (https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.mdx)
- The canonical page mixes three kinds of content (https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/01-getting-started/08-caching.mdx):
  - static markup;
  - cached components, which use `'use cache'` with `cacheLife('hours')` and `cacheTag('posts')` and become part of the shell;
  - request-time components inside `<Suspense>`.
  Mutations call `updateTag('posts')` inside a Server Action.
- `cacheLife` can take an inline object whose value comes from data, e.g. `cacheLife({ revalidate: n })`. (https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/04-functions/cacheLife.mdx)
- With cacheComponents on, anything that awaits uncached request data **must** sit under a `<Suspense>` boundary. That includes `params`, `searchParams`, `cookies()`, `headers()`, `connection()`, and any fetch not wrapped in `'use cache'`. Otherwise the build errors with "Uncached data was accessed outside of `<Suspense>`", because the route would block. (https://github.com/vercel/next.js/blob/canary/errors/blocking-route.mdx)
- `'use cache: private'` also requires cacheComponents. (https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/01-directives/use-cache-private.mdx)

**Navigation keeps previous routes alive with `<Activity>`.**
- With cacheComponents, Next hides pages with React `<Activity mode="hidden">` (the DOM stays, with `display:none`) instead of unmounting them. `useState`, form inputs and scroll position survive navigation. Effects are cleaned up when a route is hidden and recreated when it is shown again. (https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/02-guides/preserving-ui-state.mdx; https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/02-guides/migrating-to-cache-components.mdx; cacheComponents.mdx "Navigation with Activity")

**Streaming.**
- Keep LCP elements outside or above Suspense boundaries so they render in the static shell. Use the `preload` prop on an LCP `next/image`. (https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/02-guides/streaming.mdx)
- A Server Component can pass an **unawaited promise** to a Client Component that reads it with `use()` under `<Suspense>`. (https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/01-getting-started/06-fetching-data.mdx)

**Route Handlers vs Server Actions.**
- Route Handlers are the only publicly reachable endpoints. Server Actions are tied to the same-origin page that hosts them, so external callers (webhooks, and [I] our native shell or any non-React client) must use Route Handlers. (https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/03-file-conventions/route.mdx)
- Route Handlers can stream raw responses with Web Streams, for example Server-Sent Events. (https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/02-guides/streaming.mdx)

**`proxy.ts` (formerly middleware).**
- `middleware.ts` is deprecated and renamed to `proxy.ts`, with the exported function renamed from `middleware` to `proxy`. A codemod exists. (https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/02-guides/upgrading/codemods.mdx)
- **`proxy` runs on the `nodejs` runtime and does not support `edge`.** Keep `middleware` only if you need the edge runtime. (https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/02-guides/upgrading/version-16.mdx)

**next/font.**
- Import from `next/font/google` in the root layout. The font is self-hosted automatically. Variable fonts need no weight list. Use `subsets: ['latin']` and `display: 'swap'`. (https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/02-components/font.mdx)

**next/image.**
- **`priority` is deprecated in 16; use `preload`**. Passing both throws. `preload` inserts a `<link rel="preload">` in the head. Use it only for a single, known LCP image. If several images could be the LCP, prefer `loading="eager"` or `fetchPriority="high"`. (https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/02-components/image.mdx; https://github.com/vercel/next.js/blob/canary/packages/next/src/shared/lib/get-img-props.ts)
- The `sizes` prop drives which srcset widths are generated. (get-img-props.ts)

**Link prefetching.**
- The default (`prefetch` = `auto`/`null`) prefetches static routes fully and dynamic routes partially, **down to the nearest `loading.js` boundary**. `true` prefetches everything; `false` disables it. Prefetching only happens in production. (https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/02-components/link.mdx)
- When PPR is off, the segment-cache scheduler skips prefetch entirely for a dynamic route that has no loading boundary. (https://github.com/vercel/next.js/blob/canary/packages/next/src/client/components/segment-cache/scheduler.ts)
- Documented pattern for long lists: prefetch on hover with `prefetch={active ? null : false}` plus `onMouseEnter`. (https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/02-guides/prefetching.mdx)

**Bundle analysis.**
- `next experimental-analyze` analyzes the bundle without producing a build. (https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/06-cli/next.mdx)

**React Compiler.**
- Enable with `reactCompiler: true`; it is off by default. (https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/02-guides/upgrading/version-16.mdx)
- `compilationMode: 'annotation'` compiles only components marked `"use memo"`. (https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/05-config/01-next-config-js/reactCompiler.mdx)
- The default `panicThreshold: 'none'` skips components the compiler cannot handle. That only loses memoization and never affects correctness. (https://github.com/vercel/next.js/blob/canary/packages/next/src/server/config-shared.ts)

**Lazy loading.**
- `next/dynamic(() => import(...), { ssr: false })` loads a client-only component in its own chunk. It can be loaded on demand. (https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/02-guides/lazy-loading.mdx)

**Live data.**
- Next's docs name two ways to fetch in Client Components: React `use` or a library (SWR or React Query). SWR is described as handling caching, revalidation, focus tracking and interval refetching. (https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/01-getting-started/06-fetching-data.mdx; https://github.com/vercel/next.js/blob/v16.2.9/docs/02-pages/03-building-your-application/03-data-fetching/05-client-side.mdx)
- There is no server-side primitive for live ticks. [I] Live data belongs on the client: TanStack Query fed by WebSocket/SSE (see §3). RSC renders only the first snapshot.

### 1.2 Performance guidance from the docs
- Put the LCP element in the static shell and use `preload` for an LCP image. (streaming.mdx)
- Mark every per-request dependency explicitly: cache what can be cached with `use cache`, and wrap the rest in Suspense. (blocking-route.mdx)
- `features`/prefetch: routes without `loading.tsx` get no partial prefetch. (link.mdx, scheduler.ts)
- The React Compiler removes the need for manual memoization. (§2)

### 1.3 Pitfalls and version changes that affect us
- `proxy.ts` is Node-only. Do not plan edge-runtime logic in it. (version-16.mdx)
- The `priority` prop throws if combined with `preload`, and existing snippets (21st.dev, shadcn blocks) often use `priority`. (get-img-props.ts)
- Activity-based route preservation means **a trade ticket's state survives navigating away and back**. Reset it deliberately after a trade or on market change. Effects (sockets, chart instances) are torn down while hidden and re-run on show, so they must be idempotent. (preserving-ui-state.mdx) [I on the consequences]
- Reading `cookies()`/`headers()` in the root layout (which the wagmi SSR recipe does, §4) makes that read dynamic. Under cacheComponents it must be inside Suspense or the build fails. (blocking-route.mdx) [I: it follows that wagmi's `cookieToInitialState` read must be placed in a Suspense-wrapped provider island, not at the very top of the layout, or the static shell is lost.]
- Context7's newest Next docs are 16.2.9. Verify against the 16.3 release notes before relying on any flag name. [I]

### 1.4 Architecture decisions
1. `cacheComponents: true` and `reactCompiler: true` from day one.
2. Market and stock pages are split into three layers:
   - **static shell**: header, market title, rules, and the chart frame placeholder;
   - **`'use cache'` blocks**: market metadata and daily OHLC history (`cacheLife('minutes')`, `cacheTag('market:<id>')`), invalidated with `updateTag` when a market resolves;
   - **Suspense islands**: user positions (cookie/session) and the live price widget.
3. A `loading.tsx` at every dynamic segment, so default `<Link>` prefetch fetches the shell. Use hover or intent prefetch for long market lists.
4. Route Handlers (not Server Actions) for:
   - the Tempo `Handler.webAuthn` and `Handler.relay` endpoints (§5);
   - the SSE price stream;
   - anything the native shell calls.
   Server Actions only for same-page app mutations such as watchlist and profile edits.
5. `proxy.ts` only for cheap Node-side routing and headers (CSP including `frame-src` if tempoWallet is used, §5). No auth crypto on the hot path.
6. next/font with one variable font using `display: 'swap'`. next/image with `preload` only on the hero or LCP image.
7. Run `next experimental-analyze` in CI to check per-route JS budgets. [I: budget numbers TBD]

---

## 2. React 19.2

### 2.1 Recommended patterns

**`<Activity>`**
- `mode="visible" | "hidden"` (not `hidden={...}`; React warns). (https://react.dev/reference/react/Activity; https://github.com/react/react/blob/main/packages/react-reconciler/src/ReactFiberBeginWork.js)
- A hidden subtree keeps its state but its effects are unmounted. Refs are detached when it hides. (Activity-test.js and ReactFiberCommitWork.js `disappearLayoutEffects`, react/react main)
- Hidden-on-first-render content is **pre-rendered at lower priority, without mounting Effects**. That makes it useful for rendering content that is likely to be shown next. (https://react.dev/reference/react/Activity)
- SSR does not render hidden Activity content; it is client-rendered at offscreen priority. (ReactFiberBeginWork.js)

**`useEffectEvent`**
- Pulls non-reactive logic out of an Effect so it always sees the latest props and state without re-subscribing. Never list it in the dependency array. (https://react.dev/reference/react/useEffectEvent)

**`useOptimistic` and `useTransition`**
- Optimistic setters must be called inside `startTransition(async () => …)` or an Action prop. Outside one, React warns. (https://react.dev/reference/react/useOptimistic)
- Documented flow: `setOptimistic(v)`, then `await serverCall()`, then `startTransition(() => setReal(result))`. The optimistic value reverts on its own when the action settles. (useOptimistic)
- `useTransition` returns `[isPending, startTransition]`. Transition updates are non-blocking and can be interrupted by user input. (https://react.dev/reference/react/useTransition)

**`use`**
- Reads a promise passed from an RSC, under Suspense. (Next fetching-data.mdx, §1)

**React Compiler**
- Memoizes components and intermediate values automatically, which is more thorough than `React.memo` plus `useMemo`. Remove manual memoization rather than adding it. (https://react.dev/reference/react/memo; https://react.dev/reference/eslint-plugin-react-hooks/lints/preserve-manual-memoization)
- Adopt it incrementally with annotation mode and `"use memo"`. Opt out with `"use no memo"` while debugging. (https://react.dev/reference/react-compiler/compilationMode; https://react.dev/reference/react-compiler/directives)

### 2.2 What helps "tap to trade"
- **useOptimistic + transition**: the position or balance changes and the button flips to "Filled" on tap, before the sponsored transaction confirms (Tempo ~500 ms finality: `TDOCS/docs__guide__machine-payments.md`). It rolls back automatically on failure. [I: pairs well with TanStack mutation `onMutate` for cache-level optimism, §3]
- **useEffectEvent**: the socket/SSE subscription effect depends only on `marketId`. The tick handler reads the latest UI state (selected outcome, slippage) through an effect event, so changing slippage does not tear down the socket. (useEffectEvent)
- **Activity**: pre-render the trade sheet or confirm drawer hidden, so opening it costs no render work at tap time. Keep tabs such as "Positions" and "Activity" warm. (Activity "Pre-rendering") [I on the specific use]
- **Transitions**: wrap non-urgent updates (switching chart range, filtering lists) in `startTransition` so taps stay responsive. That protects INP. [I]

### 2.3 Pitfalls
- Refs are detached and effects are destroyed while hidden. A `lightweight-charts` instance created in an effect is removed and re-created every time the route or tab is hidden and shown again. Keep series data in the query cache so re-creation is a cheap `setData`. [I built on the reconciler source above]
- Effect Events must not go in dependency arrays. (useEffectEvent)

---

## 3. TanStack Query 5 (v5.90)

### 3.1 Recommended patterns (App Router)
- `getQueryClient()` creates **a new client per request on the server** and **a singleton in the browser**. The singleton matters so the client is not re-created if React suspends during the first render. Set a default `staleTime` above 0 (the docs use 60 s) so the client does not refetch right after hydration. (https://github.com/tanstack/query/blob/v5.90.3/docs/framework/react/guides/advanced-ssr.md)
- Server prefetch:
  - `await queryClient.prefetchQuery(...)` in an RSC, then `<HydrationBoundary state={dehydrate(queryClient)}>` around the client subtree (advanced-ssr.md);
  - **streaming variant**: do not await `prefetchQuery`, and configure `dehydrate.shouldDehydrateQuery = q => defaultShouldDehydrateQuery(q) || q.state.status === 'pending'`, so pending promises stream to the client (advanced-ssr.md);
  - set `shouldRedactErrors: () => false`, because Next uses thrown errors to detect dynamic rendering (advanced-ssr.md).
- Feeding from a stream:
  - `queryClient.setQueryData(key, updater)` updates the cache synchronously and creates the entry if it is missing (https://github.com/tanstack/query/blob/v5.90.3/docs/reference/QueryClient.md);
  - `invalidateQueries` marks entries stale and refetches active ones. Use `refetchType: 'none'` to mark without refetching (QueryClient.md);
  - freshness rule: stale when `dataUpdatedAt + staleTime <= now`; `staleTime: 'static'` is never stale (query-core/src/query.ts).
- `experimental_streamedQuery({ streamFn, reducer, initialValue, refetchMode })` turns an AsyncIterable into a query. The query is `success` after the first chunk and stays `fetching` until the stream ends. It is experimental. (https://github.com/tanstack/query/blob/v5.90.3/docs/reference/streamedQuery.md)
- Optimistic updates, two documented styles (https://github.com/tanstack/query/blob/v5.90.3/docs/framework/react/guides/optimistic-updates.md; migrating-to-v5.md):
  1. `onMutate`: `cancelQueries`, snapshot, `setQueryData`, return the context; `onError` restores; `onSettled` invalidates.
  2. Render from `mutation.variables` while `isPending`, with no cache writes.
- Re-render control:
  - `select` is memoized and structurally shared (queryObserver.ts);
  - tracked props: a component only re-renders for the result fields it reads, and `notifyOnChangeProps` sets that list explicitly (wagmi query-options docs, which mirror TanStack: https://github.com/wevm/wagmi/blob/main/site/shared/query-options.md).
- Persistence:
  - `PersistQueryClientProvider` with a persister. Defaults are `maxAge` 24 h, plus `buster` and `dehydrateOptions` (https://github.com/tanstack/query/blob/v5.90.3/docs/framework/react/plugins/persistQueryClient.md; createAsyncStoragePersister.md);
  - `experimental_createQueryPersister` persists per query, with `filters`, `prefix` and `maxAge`, and `storage: undefined` for SSR. `persister.persistQueryByKey` persists optimistic writes (createPersister.md).

### 3.2 Performance guidance
- Non-zero `staleTime` avoids the post-hydration refetch. (advanced-ssr.md)
- Stream pending queries instead of awaiting them, so the Suspense boundary is not blocked. (advanced-ssr.md)
- Use `select` and tracked properties to keep re-renders narrow. (queryObserver.ts, query-options.md)

### 3.3 Architecture decisions
1. **One QueryClient** shared by wagmi and the app, from `getQueryClient()`. wagmi's SSR example uses `useState(() => new QueryClient())`, but the TanStack streaming guide's singleton is the better fit for Suspense. [I: use the TanStack factory for both]
2. Query key taxonomy:
   - `['market', id]`: metadata, `staleTime` 5 min;
   - `['price', symbol]`: `staleTime: Infinity`, **written only by the stream via `setQueryData`**, seeded by an RSC prefetch;
   - `['ohlc', symbol, range]`: history, from `'use cache'`d RSC data or a route handler;
   - `['positions', address]`: invalidated after each trade confirms;
   - wagmi's own keys for chain reads.
3. **Live prices**:
   - one app-level stream connection (SSE route handler or Tempo WSS), multiplexed by symbol;
   - a single `useEffect` owns the connection and calls `setQueryData(['price', s], tick)`;
   - components subscribe with `useQuery({ queryKey: ['price', s], select })`;
   - coalesce ticks per animation frame before writing, so bursts cannot cause re-render storms. [I: rAF batching is my recommendation; the docs only describe `setQueryData`]
4. **Trades** use the `onMutate` optimistic pattern on `['positions', addr]` and the balance keys, roll back on error, and `invalidateQueries` on settle. Use the `variables` style for "pending order" rows.
5. **Persistence**: persist only slow-changing keys (market list, metadata, user watchlist) with `filters`. Never persist prices. Set `buster` = build ID. This gives the WebView an instant cold start. [I]

---

## 4. wagmi 3 and viem (incl. `viem/tempo`)

### 4.1 Recommended patterns

**SSR and cookies**
- `createConfig({ ssr: true, storage: createStorage({ storage: cookieStorage }), ... })`. In a Server Component, run `cookieToInitialState(getConfig(), (await headers()).get('cookie'))` and pass the result to `<WagmiProvider initialState>` inside a Client Component. (https://github.com/wevm/wagmi/blob/main/site/react/guides/ssr.md)

**Tempo connectors**
- `webAuthn` and `tempoWallet` come from `wagmi/tempo`, and the `tempo` chain from `wagmi/chains`. The docs set `multiInjectedProviderDiscovery: false`. (https://github.com/wevm/wagmi/blob/main/site/tempo/getting-started.md; https://github.com/wevm/wagmi/blob/main/site/tempo/connectors/webAuthn.md)
- `webAuthn` options: `authUrl` (server-backed ceremony, which cannot be combined with `ceremony`), `ceremony`, `feePayer` (URL of a `Handler.relay`, with optional `precedence`), `accessKey.authorize`, `testnet`, `mpp`. (`ACC/site/src/pages/docs/wagmi/webAuthn.mdx`)
- `tempoWallet({ authorizeAccessKey() { return { expiry } } })`. (https://github.com/wevm/wagmi/blob/main/site/shared/connectors/tempoWallet.md)

**Batched and sponsored writes**
- Tempo decorates the standard hooks. `useSendTransactionSync().mutate({ calls: [...], feePayer, nonceKey })` sends one atomic Tempo transaction with several calls and waits for the receipt. (https://github.com/wevm/wagmi/blob/main/site/tempo/getting-started.md)
- `feePayer` is either a viem Account or `true` when a fee-payer service is used. (https://github.com/wevm/wagmi/blob/main/site/shared/tempo-write-parameters.md)
- EIP-5792 hooks `useSendCalls`, `useSendCallsSync` and `useWaitForCallsStatus` also exist. (https://github.com/wevm/wagmi/blob/main/site/react/api/hooks/useSendCalls.md; useWaitForCallsStatus.md)
- Tempo-specific hooks live under `Hooks` from `wagmi/tempo`, e.g. `Hooks.fee.useSetUserToken`. (https://github.com/wevm/wagmi/blob/main/site/tempo/hooks/fee.useSetUserToken.md)

**viem/tempo**
- `withRelay(http(), http(relayUrl))` routes `feePayer: true` requests to a relay and keeps the sponsor key on the server. `withFeePayer` is the **deprecated alias**. Its `policy` is `'sign-only'` (the default: the relay co-signs and the client broadcasts) or `'sign-and-broadcast'`. (https://github.com/wevm/viem/blob/main/site/pages/tempo/guides/sponsor-fees.mdx; https://github.com/wevm/viem/blob/main/site/pages/tempo/transports/withFeePayer.mdx)
- `Account.fromWebAuthnP256(credential)` plus `client.sendTransactionSync(...)`. (https://github.com/wevm/viem/blob/main/site/pages/tempo/accounts/index.mdx)

**Reads**
- `http(url, { batch: true })` batches JSON-RPC calls into one HTTP request. (https://github.com/wevm/wagmi/blob/main/site/shared/transports/http.md)
- `useReadContracts` uses multicall, with `batchSize` defaulting to 1024 bytes of calldata per chunk. (https://github.com/wevm/wagmi/blob/main/site/react/api/hooks/useReadContracts.md)
- viem `batch: { multicall: true }` auto-batches `readContract` calls. (https://github.com/wevm/viem/blob/main/site/pages/docs/clients/public.md)
- The `fallback([...])` transport ranks transports by latency and stability. (https://github.com/wevm/viem/blob/main/site/pages/docs/clients/transports/fallback.md)

**Logs and WebSocket**
- `useWatchContractEvent` subscribes over WebSocket on WS clients (`poll` defaults to false there) and polls on HTTP clients. `batch` defaults to true; `batch: false` delivers logs individually. (https://github.com/wevm/wagmi/blob/main/site/react/api/hooks/useWatchContractEvent.md; vue/api/composables/useWatchContractEvent.md)
- viem `webSocket` transport: `keepAlive`, and `reconnect` (attempts 5, delay 2000 ms by default). (https://github.com/wevm/viem/blob/main/site/pages/docs/clients/transports/websocket.md)
- Tempo endpoints: `https://rpc.tempo.xyz` / `wss://rpc.tempo.xyz` (chain 4217) and `wss://rpc.moderato.tempo.xyz`. (`TDOCS/docs__quickstart__connection-details.md`)

### 4.2 v3 changes that affect us
- `useAccount` / `getAccount` / `watchAccount` are renamed `useConnection` / `getConnection` / `watchConnection`. `switchAccount*` becomes `switchConnection*`. (https://github.com/wevm/wagmi/blob/main/site/core/guides/migrate-from-v2-to-v3.md; https://github.com/wevm/wagmi/blob/main/site/react/api/hooks/useConnection.md)
- Connector dependencies are now installed separately (optional peers). (migrate-from-v2-to-v3.md)
- 21st.dev and older snippets use `useAccount`; port them. [I]

### 4.3 Avoiding re-render storms
- Pass TanStack `select`, and rely on tracked props or `notifyOnChangeProps` on every wagmi read hook. (query-options.md)
- Use one `useReadContracts` per screen instead of N `useReadContract` calls. (useReadContracts.md) [I on the "one per screen" rule]
- Event watchers call `setQueryData` or `invalidateQueries` on specific keys; do not keep logs in component state. [I]
- `gcTime` is `Infinity` during SSR by default. (query-options.md)

### 4.4 Architecture decisions
1. `createConfig` settings:
   - `chains: [tempo, tempoModerato]` (testnet via env);
   - `ssr: true` with `cookieStorage`;
   - `multiInjectedProviderDiscovery: false`;
   - `connectors: [webAuthn({ authUrl: '/api/auth', feePayer: '/api/relay', accessKey: { authorize: {...} } })]`;
   - transports: `fallback([webSocket(wss), http(https, { batch: true })])` [I on the fallback composition].
2. **All trades are one `useSendTransactionSync({ calls, feePayer: true })`**. For example: approve, buy, and a position-bookkeeping call in one atomic transaction. Sync mode returns the receipt in one round trip, which fits Tempo's ~500 ms finality and removes a separate wait/poll step. [I: prefer Tempo `calls` over EIP-5792 `sendCalls`, because the Tempo docs show `calls` + `feePayer` + `nonceKey` directly on the sync send]
3. Parallel nonces: use `nonceKey` so rapid successive taps do not serialize on one nonce. [I: `nonceKey` appears in the wagmi Tempo example; semantics to confirm in the Tempo tx docs]
4. **Access keys**: bounded `limits` + `scopes` (market contracts and selectors, stablecoin cap, `expiry` in days) with `reuse.minExpiry`/`minLimits`. After the first approval, trades sign locally with the access key and need no passkey prompt, which is the real "tap to trade". (`ACC/site/src/pages/docs/guides/spend-permissions.mdx`; `ACC/site/src/pages/docs/api/provider.mdx#accesskeyauthorize`)
5. The wagmi `cookieToInitialState` read lives in a Suspense-wrapped provider island (see §1.3).

---

## 5. Tempo accounts SDK (`accounts`, planned ~0.18.4)

### 5.1 Server (Next Route Handlers)
- Import `Handler` and `Kv` from `accounts/server`. Every handler exposes `.fetch` (Fetch API) and `.listener` (Node). The Next.js usage is `export const GET = handler.fetch; export const POST = handler.fetch`. (`ACC/site/src/pages/docs/server/index.mdx`)
- **`Handler.webAuthn({ kv, origin, rpId, path, ttl, cookie, cookieName, session, onRegister, onAuthenticate })`** (`ACC/site/src/pages/docs/server/handler.webAuthn.mdx`):
  - mounts `POST {path}/register/options`, `/register`, `/login/options`, `/login`, `/logout`;
  - login issues a session cookie (`accounts_webauthn` by default, 24 h `ttl.session`), or `{ token }` when `cookie: false` or `returnToken: true`;
  - `handler.getSession(req)` reads the cookie or a Bearer token and returns `{ credentialId, publicKey, userId?, issuedAt, expiresAt }`;
  - `session: false` makes login stateless, so the app can mint its own JWT in `onAuthenticate`;
  - challenge TTL defaults to 300 s.
- **`Handler.relay({ feePayer: { account, validate, name, url, feeToken }, features, autoSwap, kv, chains, transports, resolveTokens, cacheTtl, onRequest, path })`** (`ACC/site/src/pages/docs/server/handler.relay.mdx`):
  - enriches `eth_fillTransaction` with sponsorship, auto-swap, fee-token resolution, balance diffs, fee estimates and require-funds data;
  - without `validate`, it sponsors everything;
  - `features: 'all'` adds latency;
  - the provider posts to `{path}/:chainId`, so the router must send both the base path and its chain child paths to the handler.
- `Handler.compose([relay, webAuthn], { path })` mounts both on one Hono app, with a typed `hc` client. (`ACC/site/src/pages/docs/server/handler.compose.mdx`)
- **Kv**:
  - `Kv.memory()` is not for production (handler.webAuthn.mdx);
  - `Kv.from({ get, set, delete, take? })` adapts Redis and similar stores; `take` gives atomic read-and-delete (`ACC/site/src/pages/docs/server/kv.from.mdx`);
  - Cloudflare KV is eventually consistent and not safe for one-time consume (`ACC/site/src/pages/docs/server/kv.mdx`).
- Reference wiring (Cloudflare worker, `/relay/*` and `/auth/*`, `origin`/`rpId` taken from the request URL): `ACC/examples/fee-payer-and-webauthn/worker/index.ts`. Client counterpart: `webAuthn({ testnet: true, authUrl: '/auth', feePayer: '/relay' })` (`ACC/examples/fee-payer-and-webauthn/src/config.ts`).
- Production checklist for WebAuthn (`ACC/site/src/pages/docs/production.mdx`):
  - HTTPS;
  - persistent Kv;
  - a future-proof `rpId`;
  - multiple credentials per user;
  - clear ceremony errors;
  - **rate-limit all 4 ceremony endpoints**.
- rpId advice: registering with `rpId: 'example.com'` covers subdomains; the reverse does not work. Changing it strands every passkey. (`ACC/site/src/pages/docs/adapters/webauthn.mdx`)

### 5.2 Client
- `Provider.create({ adapter, auth, feePayer, relay, accessKey, storage, persistCredentials, chains, testnet, transports, mpp, maxAccounts })` (`ACC/site/src/pages/docs/api/provider.mdx`):
  - `storage` defaults to IndexedDB in the browser;
  - `persistCredentials` (default true) persists credentials and access keys;
  - `relay` routes **all** chain RPC to `${relay}/${chainId}`;
  - `feePayer` only targets the sponsor.
- In wagmi, the `webAuthn` connector accepts all Provider options except `adapter`. (wagmi/webAuthn.mdx)
- Access-key keystore default is `Keystore.webCryptoP256()`. (provider.mdx `accessKey.keystores`)
- `getAccessKeyStatus` tells you whether the next transaction will publish the key authorization. (provider.mdx)

### 5.3 Pitfalls and version notes
- **Version drift.** The repo HEAD is **0.19.0** ("removed multisig relay support; Viem 2.56.9"). The public Tempo docs now document `Handler.relay` from **`tapimo`** (the Tempo API library), with an `apiKey` option and a Store-based `cache`, instead of `accounts/server`. (`scratchpad/repos/accounts/CHANGELOG.md`; `TDOCS/docs__server.md`, `TDOCS/docs__server__relay-handler.md`) Pin `accounts@0.18.x` and follow the 0.18.4 docs cited here. Plan a later move of the relay to `tapimo`. [I]
- The access-key option is named inconsistently:
  - the `tempoWallet` connector uses `authorizeAccessKey` (spend-permissions.mdx; wagmi tempoWallet.md);
  - the `webAuthn` connector and Provider use `accessKey.authorize` (wagmi/webAuthn.mdx, provider.mdx).
- The `Provider.relay` comment in provider.mdx says "tempo (33139)", which conflicts with chain 4217 in `TDOCS/docs__quickstart__connection-details.md`. [I: stale doc comment; trust the chain object]
- Wallet-hosted approval pages require at least one `limits` and one `scopes` entry. Local adapters accept unbounded keys, but production should bound them too. (spend-permissions.mdx)
- The tempoWallet iframe needs CSP `frame-src https://wallet.tempo.xyz`, trusted-host registration, and must not be covered by overlays (IntersectionObserver v2). (production.mdx) [I: in a WKWebView this adds risk; prefer the domain-bound `webAuthn` adapter as the primary path]

### 5.4 Architecture decisions
1. One catch-all Route Handler per concern, with handlers **created once at module scope** (not per request as in the Cloudflare example):
   - `app/api/auth/[...path]/route.ts` exports `Handler.webAuthn({ path: '/api/auth', rpId: <apex domain>, origin: [web origin, …], kv })`;
   - `app/api/relay/[[...path]]/route.ts` exports `Handler.relay({ path: '/api/relay', feePayer: { account, validate }, chains: [tempo, tempoModerato], transports, kv })`;
   - the optional catch-all covers both `/api/relay` and `/api/relay/:chainId`. [I on file layout]
2. **Kv** is `Kv.from` over a Vercel Marketplace Redis (for example Upstash), implementing `take` with `GETDEL` for atomic challenge consumption. [I on the provider choice]
3. **Sponsorship policy**:
   - `validate` accepts only requests that carry a valid `getSession` and whose calls target our market or stock contracts;
   - `onRequest` rate-limits;
   - `features` stays off (no `'all'`) to keep relay latency minimal.
   Our own quote UI supplies fees and diffs. [I]
4. **Session**: use the default cookie session (httpOnly on the same origin). It works in the WKWebView as long as the web origin equals the `rpId` domain. Server Components read it via `handler.getSession(new Request(...))` or a small wrapper that reads the cookie. [I]
5. **Native wrapper**: WebAuthn in WKWebView needs an associated domain and `webcredentials` for `rpId`. The accounts SDK has `mobileWebAuth`/react-native docs (`ACC/site/src/pages/docs/api/mobileWebAuth.mdx`, `guides/react-native.mdx`), not reviewed in depth here. [I: needs a dedicated check]

---

## 6. lightweight-charts 5.2

### 6.1 Recommended patterns
- The v5 API is `chart.addSeries(LineSeries | AreaSeries | CandlestickSeries | …, options, paneIndex)`. Importing the series type explicitly enables tree-shaking. (https://github.com/tradingview/lightweight-charts/blob/v5.2.0/website/versioned_docs/version-5.2/migrations/from-v4-to-v5.md; https://context7.com/tradingview/lightweight-charts/llms.txt)
- The watermark moved out of core into a tree-shakeable plugin. (version-5.1 migrations/from-v4-to-v5.md)
- **Real time**: use `series.update(point)`, which updates the last bar or appends a new one. `setData` is for full-history replacement only. Calling `setData` on every tick resets the visible range and snaps the chart. (https://github.com/tradingview/lightweight-charts/blob/v5.2.0/website/versioned_docs/version-5.1/intro.mdx; https://github.com/tradingview/lightweight-charts/blob/master/.github/skills/lightweight-charts/SKILL.md)
- `autoSize: true` installs a ResizeObserver on the container and repaints synchronously, so there is no jitter. (https://github.com/tradingview/lightweight-charts/blob/master/src/gui/chart-widget.ts)
- `chart.remove()` tears down all subscriptions, the DOM and animation frames. (https://github.com/tradingview/lightweight-charts/blob/master/src/api/chart-api.ts)

### 6.2 Architecture decisions
1. `<PriceChart>` is a client component loaded with `next/dynamic(..., { ssr: false })`. It sits behind a fixed-height placeholder that is part of the static shell, so there is no CLS and it stays out of the LCP path. (lazy-loading.mdx) [I on the placeholder]
2. Lifecycle: the effect creates the chart (`autoSize: true`) and calls `setData(history from query cache)`. The cleanup calls `chart.remove()`. This survives Activity hide/show (§2.3).
3. Ticks: subscribe to the query cache (`queryClient.getQueryCache().subscribe` or a `useQuery` + `useEffectEvent`) and call `series.update()`. **Chart updates never go through React state.** [I]
4. Import only the series types we use (Area/Line for probability, Candlestick for stocks).

---

## 7. motion (`motion/react`)

### 7.1 Recommended patterns
- **Bundle size**: use `<LazyMotion features={domAnimation}>` with `m.*` components from `motion/react-m`. `domAnimation` (+18 kb) covers animations, variants, exit, and hover/press/focus. `domMax` (+28 kb) adds drag/pan and layout animations. `features` can be a dynamic import so they load after first render. `strict` throws if a full `motion.*` component slips in. (https://motion.dev/docs/react-reduce-bundle-size; https://motion.dev/docs/vue-lazymotion)
- **Reduced motion**: `<MotionConfig reducedMotion="user">` disables transform and layout animations but keeps opacity and color. The default is `"never"`. (https://motion.dev/docs/react-accessibility; https://motion.dev/docs/react-motion-config)
- **Layout**:
  - `layout`, `layout="position"|"size"`, `layoutId` for shared elements, `LayoutGroup id` to namespace them;
  - `layoutDependency` limits measurement to when a dependency changes, since layout is otherwise measured every render;
  - `AnimatePresence mode="popLayout"` needs a positioned parent and ref-forwarding children.
  (https://motion.dev/docs/vue-motion-component; https://motion.dev/docs/react-animate-presence; https://motion.dev/docs/vue-layout-group)
- **Performance**:
  - Motion values (`useMotionValue`) update styles without re-renders (https://motion.dev/docs/vue-motion-component);
  - individual transforms (`x`, `scale`) are implemented with CSS variables and **are not hardware-accelerated**. Prefer full `transform`/opacity for heavy animations (https://motion.dev/docs/performance).

### 7.2 Architecture decisions
1. The root layout gets `<LazyMotion features={loadDomAnimation} strict>` plus `<MotionConfig reducedMotion="user">`. Use only `m.*`, and lint against `motion.*`. [I on the lint]
2. Load `domMax` only in routes that need layout or drag, for example a sheet with a drag handle, via a nested async `LazyMotion`. [I]
3. Price-flash and number-tick effects use motion values or CSS, never React state per tick. Add `layoutDependency` on any `layout` list that re-renders with prices.

---

## 8. Tailwind CSS 4 and shadcn/ui

### 8.1 Recommended patterns
- The shadcn v4 theme scaffold (https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/(root)/theming.mdx) consists of:
  - `@import "tailwindcss"` and `@import "shadcn/tailwind.css"`;
  - `@custom-variant dark (&:is(.dark *))`;
  - semantic tokens (`--background`, `--primary`, `--chart-1..5`, `--radius`, …) defined in OKLCH under `:root` and `.dark`;
  - `@theme inline { --color-background: var(--background); … }` mapping them to utilities;
  - base layer `border-border outline-ring/50` and `bg-background text-foreground`.
- Why `@theme inline`: when a theme variable references another variable, `inline` makes utilities use the underlying value, which avoids variable-resolution surprises across DOM nesting. (https://tailwindcss.com/docs/theme; https://tailwindcss.com/docs/colors)
- Only theme variables that are used get emitted, unless you use `@theme static`. (https://tailwindcss.com/docs/theme)
- Adding a token (for example `--warning`, or our `--up`/`--down`): define it in `:root`/`.dark`, map it in `@theme inline`, then add a cva variant in the component source. (https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/customization.md)
- `components.json`:
  - `style` encodes the primitive base: `radix-nova` vs `base-nova` (Base UI); `tailwind.cssVariables: true` (theming.mdx; https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/preset/preset.ts; https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/config.ts);
  - `registries` maps namespaces to URLs, installed with `npx shadcn add @ns/item` (https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/registry/namespace.mdx);
  - registry items can carry `cssVars` (theme/light/dark) that are merged into globals on install (https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/registry/examples.mdx).
- Styling rules (https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/rules/styling.md):
  - `className` is for layout only;
  - change colors via variants, then semantic tokens, then CSS variables;
  - use semantic tokens for status (e.g. `text-destructive` for −3.2 %).
- Components expose `data-slot` / `data-variant` hooks. (https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/button.tsx)

### 8.2 Adapting 21st.dev and third-party registry components
Procedure, following the documented order: variants, then tokens, then CSS vars.
1. Install through the namespaced registry so dependencies and `cssVars` resolve.
2. Diff the `cssVars` it added. **Rename or merge them onto our tokens** rather than keeping a parallel palette.
3. Replace raw colors (`bg-zinc-900`, hex values, `text-white`) with semantic utilities (`bg-card`, `text-foreground`, `text-up`/`text-down`).
4. Move any color overrides passed through `className` into cva variants.
5. Swap `motion.*` for `m.*`, `useAccount` for `useConnection`, and `priority` for `preload`.
6. Check that the component uses the same primitive base (Radix vs Base UI) as our `style`.
[I: synthesis of the cited rules; items 5 and 6 come from §4, §7 and §1]

### 8.3 Architecture decisions
1. Choose one primitive base (`base-*` or `radix-*`) at init and do not mix them. [I: Base UI is the newer default in the shadcn style list; either works]
2. The token set is the shadcn semantic set plus trading tokens: `--up`, `--down`, `--up-muted`, `--down-muted`, `--yes`, `--no`, and `--chart-grid`/`--chart-text`. The chart reads these through `getComputedStyle` so the canvas matches the theme. [I]
3. Put the dark class on `<html>` before first paint (no flash) and use `@custom-variant dark`.

---

## 9. Consolidated architecture (what the build plan should say)

1. **Rendering**:
   - Next 16 with `cacheComponents` and `reactCompiler` on;
   - static shell + `'use cache'` market data + Suspense islands for user and live data;
   - `loading.tsx` on every dynamic segment;
   - LCP content in the shell; chart lazy and client-only behind a fixed placeholder.
2. **Data**:
   - one QueryClient (server per request, browser singleton), shared with wagmi;
   - RSC `prefetchQuery` without await and pending-query dehydration to stream;
   - `staleTime` > 0 by default and `Infinity` for stream-owned price keys;
   - a single stream connection writes `setQueryData`, coalesced per frame;
   - persist only slow keys.
3. **Chain**:
   - wagmi 3 with `ssr` + `cookieStorage` and the `webAuthn` connector (`authUrl`, `feePayer`, bounded `accessKey.authorize`);
   - WSS-first `fallback` transport, HTTP `batch: true`, `useReadContracts` multicall;
   - every trade is one `useSendTransactionSync({ calls, feePayer: true })`.
4. **Server**:
   - `Handler.webAuthn` and `Handler.relay` from `accounts/server@0.18.x` in Node Route Handlers;
   - a persistent `Kv.from(Redis)` with `take`;
   - a sponsorship `validate` gated on the session plus a contract allowlist;
   - rate limits on ceremony and relay endpoints.
5. **Instant UX**:
   - access keys remove per-trade passkey prompts;
   - `useOptimistic`/`onMutate` show the fill immediately;
   - `useEffectEvent` keeps sockets stable;
   - `<Activity>` pre-renders the trade sheet;
   - transitions for non-urgent updates;
   - reset ticket state explicitly, because routes are Activity-preserved.
6. **UI**: LazyMotion + `m` + `reducedMotion="user"`; Tailwind 4 + shadcn semantic tokens via `@theme inline`; third-party components normalized onto our tokens.
7. **Open items**:
   - confirm Next 16.3 deltas;
   - confirm `nonceKey` semantics;
   - review `mobileWebAuth` and the WKWebView passkey setup;
   - plan the relay's later move from `accounts/server` to `tapimo`.
