# open-libs — research for the open library questions (2026-09-29)

Intended path: `/private/tmp/claude-501/-Users-abu-dev-hackathon-crypto-world-fair/86cc565d-9d7b-474e-a8f8-af9627b83f69/scratchpad/research/open-libs.md`.
Plan mode was on, so this file was the only one I could write. Copy it to that path.

**Method note.** Context7 returned "Monthly quota exceeded" on every call (resolve-library-id ×6, query-docs ×1). I fell back to
each vendor's own docs: `llms.txt` and `.md` pages, the official blog, and GitHub docs. Raw copies are in
`…/scratchpad/research/src/` (the `bui-*.md`, `lhci-*.md`, `lh-*.md` and `nf-index.html` files). For Q5 I also read the published
viem 2.56.9 and accounts 0.18.4 sources, because the docs say "handled automatically" without saying how. `[I]` marks an inference.

---

## 1. Base UI

**Package.** The package is `@base-ui/react`. It was "previously published as `@base-ui-components/react` and has since been
renamed" (https://base-ui.com/react/overview/quick-start.md). The current release is v1.8.0 (Sep 4, 2026) and v1.0.0 shipped
on Dec 11, 2025 (https://base-ui.com/llms.txt). It is one tree-shakable package with a subpath import per component, for example
`import { Drawer } from '@base-ui/react/drawer'` (quick-start).

**Setup (quick-start §Set up).**
- Wrap the app in `<div className="root">` with `isolation: isolate` so portaled popups always sit above the page.
- For iOS 26+ Safari, add `body { position: relative }`. Backdrops use `position: absolute` so they cover the visual viewport.

**Dialog** (https://base-ui.com/react/components/dialog.md, API table around lines 4120–4300)
- Parts: `Root > Trigger`, then `Portal > Backdrop + Viewport > Popup > Title / Description / Close`.
- `modal: boolean | 'trap-focus'` defaults to `true`. `true` traps focus, locks scroll and blocks outside pointer events.
  `'trap-focus'` traps focus but does not lock scroll. With either value, render `<Dialog.Close>` inside the Popup.
- `onOpenChange(open, eventDetails)`.
- `disablePointerDismissal` (default false).
- `actionsRef` gives `{unmount, close}`.
- `onOpenChangeComplete(open)` runs after the animation finishes.
- `handle` comes from `Dialog.createHandle()` and supports detached triggers.
- Popup `initialFocus` / `finalFocus` accept `boolean | ref | (interactionType) => …`. By default focus goes to the first
  tabbable element, but when the dialog is opened by touch the popup itself gets focus.
- Portal takes `container` (an HTMLElement, a ShadowRoot or a ref) and `keepMounted`.

**Drawer.** Drawer is a stable component (https://base-ui.com/react/components/drawer.md). "Drawer extends Dialog: It adds
gesture support, snap points, and indent effects… A panel that slides in from the edge of the screen and doesn't need gesture
support is a positioned Dialog" (line 284).
- Parts: `Provider`, `IndentBackground`, `Indent`, `Root`, `Trigger`, `SwipeArea`, `Portal`, `Backdrop`, `Viewport`, `Popup`,
  `Content`, `Title`, `Description`, `Close`, and `VirtualKeyboardProvider`.
- **There is no `side` prop.** "Positioning is handled by your styles. `swipeDirection` defaults to `"down"`… Use `"up"`,
  `"left"`, or `"right"`" (line 365).
- The official right-edge demo (lines 25–51) uses:
  - `<Drawer.Root swipeDirection="right">`;
  - `<Drawer.Viewport className="fixed inset-0 flex items-stretch justify-end">`;
  - a Popup that uses `translateX(var(--drawer-swipe-movement-x))` and `data-starting-style` / `data-ending-style`
    translate-out, plus a Backdrop opacity tied to `--drawer-swipe-progress`.
- Root props also include `snapPoints`, `defaultSnapPoint`, `disablePointerDismissal`, `handle` and `actionsRef`.
- `SwipeArea.swipeDirection` defaults to the opposite of Root's, which is how swipe-to-open works.

**Popover** (popover.md)
- Parts: `Root`, `Trigger`, `Portal`, `Backdrop`, `Positioner`, `Popup`, `Arrow`, `Viewport`, `Title`, `Description`, `Close`.
- Trigger takes `openOnHover` and `delay` (300).
- Positioner takes `side`, `align`, `sideOffset`, `collisionPadding` and `anchor`.
- CSS variables: `--anchor-width`, `--available-height`, `--transform-origin`. Data attributes: `data-side`, `data-align`.
- `modal` defaults to `false`.

**Menu** (menu.md anatomy)
- `Root > Trigger`, then `Portal > Backdrop / Positioner > Popup`.
- Inside the Popup: `Item`, `LinkItem`, `Separator`, `Group` + `GroupLabel`, `RadioGroup` / `RadioItem` / `RadioItemIndicator`,
  `CheckboxItem` + `CheckboxItemIndicator`, `SubmenuRoot` / `SubmenuTrigger`, `Arrow`, `Viewport`.

**Tabs** (tabs.md)
- `Root > List > Tab + Indicator`, then `Panel`.
- The Indicator gets the CSS variables `--active-tab-left` and `--active-tab-width`, and there is a `data-activation-direction`
  attribute. That covers the "active pill" technique without motion `layoutId` `[I]`.

**Slider** (slider.md)
- `Root > Label, Value, Control > Track > Indicator + Thumb`.
- `onValueChange(value, details)` and `onValueCommitted`.
- `thumbAlignment: 'center' | 'edge' | 'edge-client-only'`.
- `step`, `largeStep` (10), and `format: Intl.NumberFormatOptions`.

**Toast** (toast.md)
- Parts: `Provider`, `Portal`, `Viewport`, `Root`, `Content`, `Title`, `Description`, `Close`, `Action`, and `Positioner` +
  `Arrow` for anchored toasts.
- `Toast.useToastManager()` returns `{toasts, add, update, close, promise}`. `Toast.createToastManager()` works outside React
  (useful for TxLifecycle and stream events `[I]`).
- Provider takes `limit`, `timeout` and `toastManager`.
- CSS variables: `--toast-index`, `--toast-offset-y`, `--toast-height`, `--toast-swipe-movement-x/y`.
- Data attributes: `data-type`, `data-expanded`, `data-behind`, `data-limited`.
- F6 moves focus to the viewport.

**Styling** (https://base-ui.com/react/handbook/styling.md)
- Base UI ships no CSS.
- `className` and `style` each accept a value or `(state) => …`.
- State is exposed as data attributes (`data-open`, `data-closed`, `data-checked`, `data-highlighted`, `data-starting-style`,
  `data-ending-style`…), so Tailwind 4 variants such as `data-highlighted:bg-…` work.

**Composition** (handbook/composition.md)
- The `render` prop takes an element or `(props, state) => el`. It replaces Radix `asChild`.
- A custom component passed to `render` must forward its ref and spread all props.

**Animation with motion** (handbook/animation.md, lines 88–277)
- Base UI waits on `element.getAnimations()`. With Motion, animate `opacity`, or `opacity: 0.9999` for a translating drawer,
  so that unmount waits for the exit.
- For popups that unmount when closed: control `open`, put `keepMounted` on the Portal, render the Popup as `motion.div`, and
  wrap it in `<AnimatePresence>`.
- For kept-mounted popups: animate on `open` without AnimatePresence.

**SSR and CSP.** `CSPProvider nonce` from `@base-ui/react/csp-provider` covers the inline `<style>`/`<script>` that some parts
render for pre-hydration behaviour (https://base-ui.com/react/utils/csp-provider.md). Portals render client-side `[I]`.

**Radix → Base UI mapping** (local skill `/Users/abu/.agents/skills/migrate-radix-to-base/{universal-patterns,class-mapping,
menus,consumer-props}.md`, built against the shadcn radix/base registry pairs and `@base-ui/react@1.6.0`)
- **Imports.** `radix-ui` / `@radix-ui/react-x` → `@base-ui/react/<kebab>`. Types: `ComponentProps<typeof X.Part>` →
  `X.Part.Props`.
- **Composition.** `asChild` → `render={<El/>}`. The Slot idiom → `useRender` + `mergeProps`. Button → `@base-ui/react/button`.
- **Positioning.** Radix `Portal > Content` → `Portal > Positioner > Popup`. `side`, `align` and the offsets move to Positioner.
  `Overlay` → `Backdrop`. Centred dialogs use a Popup without a Positioner.
- **Classes and variables.**
  - `data-[state=open|closed]` → `data-open` / `data-closed`.
  - `data-[state=active]` → `data-active`; `data-[state=on]` → `data-pressed`.
  - `animate-in` / `animate-out` → transitions keyed on `data-starting-style` / `data-ending-style`.
  - `--radix-*-transform-origin` → `--transform-origin`; `--radix-*-trigger-width` → `--anchor-width`.
- **Renamed parts.** DropdownMenu → Menu. Tabs `Trigger` → `Tab` and `Content` → `Panel`. Slider `Range` → `Indicator`,
  with a new `Control`. HoverCard → PreviewCard.
- **Events.** `onOpenChange(open, eventDetails)`: the `onEscapeKeyDown` / `onPointerDownOutside` handlers become a branch on
  `eventDetails.reason`, and `eventDetails.cancel()` prevents the change.
- **Menu items.** `onSelect` → `onClick` + `closeOnClick`. Checkbox and radio items default to `closeOnClick=false`, the reverse
  of Radix.
- **Drawers and toasts.** vaul drawers move to `@base-ui/react/drawer`. sonner is third-party and is not a Base UI part.
- **Golden base variant.** shadcn serves one per component at `https://ui.shadcn.com/r/styles/base-<style>/<component>.json`.

## 2. @number-flow/react (https://number-flow.barvian.me/, copy in `src/nf-index.html`)

**Usage.** `import NumberFlow, { NumberFlowGroup, continuous, useCanAnimate } from '@number-flow/react'` and
`<NumberFlow value={n} />`.

**Props.**
- Formatting: `format` (Intl.NumberFormatOptions, for example `{notation:'compact'}`), `locales`, `prefix`, `suffix`.
- Motion: `trend` (+1/0/−1 or a function), `animated`, `respectMotionPreference` (default `true`), `transformTiming` /
  `spinTiming` / `opacityTiming`, `isolate`.
- Other: `willChange` (default false), `plugins: [continuous]`, `digits` (not reactive), `nonce`.

**Reduced motion.** It follows the OS setting by default. `useCanAnimate({respectMotionPreference})` reports whether the
browser supports the effect and the user allows motion.

**Performance.** The docs recommend `willChange` when "Your number is guaranteed to change frequently", and quote MDN that
"excessive use of will-change will result in excessive memory use". The docs give no numbers for how many instances are safe
`[I]`. For dense lists that update every second, render plain `numbers`-formatted text or set `animated={false}`. Keep
NumberFlow for headline and hero figures and set `willChange` only there. Wrap figures that move each other in
`<NumberFlowGroup>`.

**SSR and CSP.** The styles are exported (`import { styles }`) for CSP hashing, and `nonce` passes through to the inline
`<style>`. `::part` styles can flash unstyled in browsers without Declarative Shadow DOM; the docs give a `data-supports-dsd`
head-script workaround.

**Limitations.**
- No scientific or engineering notation.
- No non-Latin digits and no RTL.
- The browser must support CSS `mod()`.

**Size.** `@number-flow/react@0.6.2` is 6.3 KB gzip (19.0 KB minified), with dependencies `number-flow` and `esm-env`
(bundlephobia API; npm registry).

## 3. pnpm catalogs (https://pnpm.io/catalogs)

The default catalog is `catalog:` and is referenced as `catalog:` or `catalog:default`. Named catalogs look like this:
```yaml
catalogs:
  mobile:
    react: 19.2.3
    react-native: 0.86.3
```
They are referenced as `"react": "catalog:mobile"`. Both kinds can coexist.

- **Where `catalog:` works.** In `dependencies`, `devDependencies`, `peerDependencies` and `optionalDependencies`, and in
  `pnpm-workspace.yaml` `overrides`.
- **Publishing.** `pnpm publish` and `pnpm pack` replace the reference with the real range.
- **Settings.** `catalogMode` (manual by default, or strict / prefer; since 10.12.1). `catalogPrune` (since 11.22.0; formerly
  `cleanupUnusedCatalogs`).

**pnpm 11** (https://pnpm.io/blog/releases/11.0)
- Needs Node ≥ 22 and ships as pure ESM.
- `.npmrc` now holds auth and registry only. Every other setting moves to `pnpm-workspace.yaml`, and environment variables use
  the `pnpm_config_*` prefix.
- `allowBuilds` replaces `onlyBuiltDependencies`, `neverBuiltDependencies` and `ignoredBuiltDependencies`.
- `minimumReleaseAge` defaults to 1440 (one day) and `blockExoticSubdeps` defaults to `true`.
- The store index is now SQLite.
- New commands: `pnpm ci`, `pnpm clean`, `pnpm sbom`, `pnpm with`.

**Versions.** npm dist-tags on 2026-09-29: `latest` is 12.6.0, released 2026-09-22 (12.0.0 came out 2026-08-26); `latest-11` is
11.27.1. The plan pins 11.24.0, which is still a valid 11.x.

**Expo** (https://docs.expo.dev/guides/monorepos/)
- SDK ≥ 54 supports isolated installs. The fallback is `nodeLinker: hoisted`.
- "Duplicate React Native versions in a single monorepo are not supported" and "Duplicate React version in a single app will
  cause runtime errors."
- Expo's documented fix is a root `resolutions.react`. **Don't use it here:** it would force a single React onto web (19.2.8)
  and mobile (19.2.3) alike `[I]`. Keep React as a peer in the shared packages and pin it per app through the catalog.
- SDK ≥ 55 turns on `autolinkingModuleResolution` automatically in monorepos.
- The Expo docs do not mention catalogs. `expo install --check` reads installed versions, so a `catalog:` specifier should
  pass `[I]`. SM1 should verify that.

## 4. Lighthouse CI (`@lhci/cli` 0.15.1 bundles lighthouse 12.6.1, per npm)

**Config** (https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md)
- The file is `lighthouserc.{js,cjs,json,yml}` with a `{ci:{collect,assert,upload}}` shape.
- Assertions look like `"largest-contentful-paint": ["error", {"maxNumericValue": 2500, "aggregationMethod": "median-run"}]`.
  The same shape covers `cumulative-layout-shift` (0.05) and `total-blocking-time` (200).
- The default aggregation is `optimistic` with `minScore: 1`. The other methods are `median`, `median-run` and `pessimistic`.
- Presets: `lighthouse:recommended` and `lighthouse:no-pwa`.

**Budgets.**
- Inline form: `resource-summary:<type>:(size|count)`, for example
  `"resource-summary:script:size": ["error", {"maxNumericValue": <bytes>}]`. Types include `document`, `font` and
  `third-party`. Units are **bytes** here and **KB** in `budget.json`.
- `budgetsFile` **cannot be combined** with other assertions (lines 837–864).
- `resource-summary` measures transfer size per page load. It does not measure per-route first-load chunks, so the manifest
  route-budget script remains the gate for §3.1 JS `[I]`.

**Mobile defaults** (lighthouse `core/config/constants.js`, `docs/throttling.md`)
- The default form factor is mobile: Moto G Power emulation at **412×823** with DPR 1.75.
- Throttling is `mobileSlow4G`, simulated by default.
- The CPU multiplier is 4×.
- **390 px needs an override:**
  `settings.screenEmulation = {mobile:true, width:390, height:844, deviceScaleFactor:3, disabled:false}` with
  `formFactor:'mobile'`. Leave the throttling at its defaults.
- Use `numberOfRuns` 3 or more with `median-run` for stability.

**Running against Vercel previews**
- Vercel sends `repository_dispatch` events of type `vercel.deployment.success`, with the preview URL in
  `github.event.client_payload.url`. **The workflow file must already be on the default branch**, so add a `workflow_dispatch`
  trigger for testing (https://vercel.com/docs/git/vercel-for-github). `deployment_status` still works but can be switched off.
- Protected previews need the headers `x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET` and
  `x-vercel-set-bypass-cookie: true`
  (https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).
- In LHCI, pass them via `collect.settings.extraHeaders` as JSON, from a GitHub secret.
- Upload with `upload.target: temporary-public-storage`, or `filesystem` so the reports aren't public `[I]`.

## 5. Tempo nonce lanes

**Protocol** (reference/tempo-docs-md)
- `nonceKey = 0` is the protocol nonce, which runs in sequence.
- `1..2^256−2` are 2D lanes. Each lane is its own sequence, stored at `keccak256(abi.encode(account, nonce_key))` in the NONCE
  precompile `0x4E4F4E4345…` (`docs__protocol__transactions__spec-tempo-transaction.md` lines 205–251).
- `nonceKey = uint256.max` is the **expiring nonce** mode: `nonce` must be 0, and `validBefore` is required with
  `now < validBefore ≤ now + MAX`. Replay protection comes from a ring buffer of transaction hashes.
- Invariant E7: "Multiple expiring nonce txs from same sender can execute in same block" (`docs__protocol__tips__tip-1009.md`
  lines 23–54, 185–215).
- **T11 (mainnet 2026-09-10) raised MAX from 30 s to 300 s** (TIP-1093) and grew the buffer to 3 M entries
  (`docs__changelog.md` lines 12, 32, 57; `docs__guide__tempo-transaction.md` line 1670).
- Nonces belong to the account, so an access key signs on the account's lanes. "Expiring nonces work with access key
  signatures" (TIP-1009 line 195).

**Cost**
- A new 2D key costs 22,100 gas; an existing key costs 5,000, plus 2×WARM_SLOAD at T2 (spec lines 1189–1219; tip-1036 §8).
- Expiring nonces use WARM_SSTORE_RESET writes with no state gas (tip-1016 line 99).
- The wallet quickstart recommends expiring nonces (`docs__quickstart__wallet-developers.md` lines 46, 206).

**viem and wagmi field names.** On `sendTransaction` / `sendTransactionSync` / `useSendTransaction` the fields are
`nonceKey` (`maxUint256` or `'expiring'` for expiring mode, `1n…` for a lane), `nonce`, `validBefore`, `validAfter` and
`feePayer` (`docs__guide__tempo-transaction.md` lines 1672–1731, 1932–2010; https://viem.sh/tempo/transactions.md;
https://viem.sh/tempo/guides/concurrent-transactions.md).

**"Handled automatically" — what viem 2.56.9 actually does** (`viem/tempo/chainConfig.ts` lines 208–240):
- `nonceKey` is `'expiring'` or `maxUint256` → expiring.
- Any other explicit `nonceKey` → no expiring nonce.
- **`feePayer` set and no `nonceKey` → expiring.**
- Otherwise it switches to expiring only when `Concurrent.detect(address)` sees more than one request **in the same
  microtask tick** (`internal/concurrent.ts`).
- In expiring mode it sets `nonce=0` and `validBefore = now + 25 s` (`maxExpirySecs = 25`). It also sets a random past
  `validAfter`, "to distinguish otherwise-identical expiring transactions", which avoids hash collisions between two identical
  taps.

⇒ Taps made seconds apart on a non-sponsored path fall back to the protocol nonce and **would** queue behind each other.

**accounts 0.18.4.** The RPC schema carries `nonceKey: bigint` (there is no `'expiring'` literal), plus `nonce`,
`validBefore` and `validAfter` (`accounts/src/core/zod/rpc.ts` lines 175–194). Through the wagmi / accounts connector, pass
`nonceKey: maxUint256` and an explicit `validBefore` `[I]`.

**Answer.** Yes. One account, or one access key acting for it, can send many transactions concurrently with no head-of-line
blocking by using expiring nonces, or a distinct 2D lane per stream.

## 6. Next.js 16.3 vs 16.2

Next 16.3.0 shipped 2026-08-03 and the latest is 16.3.6 (2026-09-22) (npm; https://nextjs.org/blog/next-16-3).

**cacheComponents** (https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)
- No changes since 16.0. It still needs the Node runtime.
- Activity keeps **up to 3 routes** alive (https://nextjs.org/docs/app/guides/preserving-ui-state).
  - Transient popovers and menus should close in a `useLayoutEffect` cleanup, or on Link `onNavigate`.
  - For dialogs with init logic, derive `open` from a search param.
  - `useRouter().bfcacheId` works as a reset key.
  - E2E tests must use visibility-aware selectors such as `getByRole` or `.filter({visible:true})`.
- **New, opt-in: `partialPrefetching: true`** (requires cacheComponents):
  - Each route gets one reusable App Shell prefetch, replacing per-link prefetches.
  - `<Link prefetch={true}>` fetches URL data as well.
  - A per-segment `prefetch` export overrides the default.
  - Shells that read `cookies()` are cached per session.
  - Source: https://nextjs.org/docs/app/api-reference/config/next-config-js/partialPrefetching.
- **Also new in 16.3:**
  - ISR shells for params that were not prerendered.
  - `catchError` from `next/error` for error boundaries with `retry()`.
  - `next/root-params`.
  - Prefetch inlining.
  - The `instant()` Playwright helper from `@next/playwright`.
  - An `export const instant = false` escape hatch (https://nextjs.org/docs/app/guides/ai-agents Step 3).

**reactCompiler**
- `reactCompiler: true`, or `{compilationMode:'annotation'}`, still needs `babel-plugin-react-compiler`
  (…/reactCompiler).
- New and **experimental**: `experimental.turbopackRustReactCompiler: true`. It removes the need for the babel plugin, but the
  docs say it is "not recommended for production" (…/turbopackRustReactCompiler).

**proxy.ts.** No change in 16.3. It defaults to Node, and setting `runtime` in it throws (…/file-conventions/proxy).

**`next experimental-analyze`.** Introduced in 16.1. `-o/--output` writes to `.next/diagnostics/analyze` without starting a
server. Since 16.0, `next build` prints no JS size metrics (…/cli/next).

**Other 16.3 items**
- `next build` uses the disk cache by default.
- `next build` can type-check with TypeScript 7 if you bump it to `typescript@^7`.
- Server rendering uses Node streams.
- Dev memory eviction.
- Experimental `useOffline`.

**⚠ `next dev` writes agent files.** "On Next.js 16.3 or later, run `next dev`. When an AI coding agent is detected… Next.js
auto-generates `AGENTS.md` and `CLAUDE.md` at the project root." The opt-out is `agentRules: false` in `next.config.ts`
(https://nextjs.org/docs/app/guides/ai-agents). This collides with the owner's no-tool-config rule and the plan's
`no-agent-files` invariant.
