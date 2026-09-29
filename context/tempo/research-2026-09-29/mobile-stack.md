# Mobile stack — library documentation study (Context7), 2026-09-29

Scope: how the libraries chosen in Appendix D / SM1–SM5 of `sunny-forging-simon.md` are meant to be used, what their
docs say about performance, pitfalls and version changes, and what that means for our app. Not a dependency review.

Sources are Context7 extracts of official docs (URLs given per claim). `[I]` = my inference, not stated in the docs —
each one names how to prove it. Context7 libraries used: `/websites/expo_dev`, `/websites/expo_dev_versions`
(latest SDK reference), `/react-native-webview/react-native-webview`, `/expo/eas-cli`, `/margelo/react-native-mmkv`,
`/uni-stack/uniwind`, `/gorhom/react-native-bottom-sheet`, `/software-mansion-labs/react-native-bottom-sheet`,
`/websites/swmansion_react-native-reanimated`.

Short URL keys used below:
- RNW-REF = https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md
- RNW-GUIDE = https://github.com/react-native-webview/react-native-webview/blob/master/docs/Guide.md
- RNW-ANDROID = https://github.com/react-native-webview/react-native-webview/blob/master/docs/Custom-Android.md
- NOTIF = https://docs.expo.dev/versions/latest/sdk/notifications
- WIDGETS = https://docs.expo.dev/versions/latest/sdk/widgets
- DOM = https://docs.expo.dev/guides/dom-components

---

## 0. Changes to Appendix D (summary; details in each section)

| # | Where | Change | Why (doc) |
|---|---|---|---|
| C1 | D.2 | `__CWF_SHELL__` on Android comes from `injectedJavaScriptObject` (read via `window.ReactNativeWebView.injectedObjectJson()`); keep `injectedJavaScriptBeforeContentLoaded` for iOS; the `cwf.shell` cookie from the UA stays the server-side source of truth | RNW docs: before-content-loaded injection "may work but is not 100% reliable" on Android; `injectedJavaScriptObject` is "more reliable" (RNW-REF, RNW-GUIDE) |
| C2 | D.3 | Origin check must be exact (`new URL(nativeEvent.url).origin === APP_ORIGIN`), on every message, both platforms; bridge must also be robust to same-origin iframes | Android registers the message listener for origin `*` and ignores `isMainFrame`; `nativeEvent.url` = sending frame (iOS) / `sourceOrigin` (Android) (WebViewTypes.ts, RNCWebView.java) |
| C3 | D.2 | `pullToRefreshEnabled` is iOS-only → Android pull-to-refresh must be built (web-side in shell mode, or native) | RNW-REF: platform iOS |
| C4 | D.2 | Drop `sharedCookiesEnabled` (iOS-only; only for cookies set from native into `NSHTTPCookieStorage`, which we never do) [I] | RNW-REF / RNW-GUIDE |
| C5 | D.2 | Termination: iOS `onContentProcessDidTerminate` → `reload()`; Android `onRenderProcessGone` → remount the WebView (new `key`, `source` = last known path) rather than `reload()` [I] | RNW-REF (Android API ≥ 26 only; iOS termination can be an OS memory reclaim, not a crash) |
| C6 | D.2 | No white flash recipe: `SplashScreen.preventAutoHideAsync()` at module scope, hide on the web `ready` message (with timeout fallback); `expo-system-ui` root background + `userInterfaceStyle: automatic`; splash `dark` variant; WebView `backgroundColor` = theme background (opaque) | Splash + system-ui docs; RNW iOS sets `opaque` only when alpha = 1, Android inner WebView is always transparent over its container |
| C7 | D.2 | `originWhitelist` handling: route all non-app links in `onShouldStartLoadWithRequest` (SFSafariViewController/Custom Tabs, wallet schemes); make sure the whitelist doesn't hand them to the OS first [I, verify in SM1.3]; note Android doesn't call the handler on first load and has no `isTopFrame` | RNW-REF |
| C8 | D.2 | Android `textZoom: 100` (keeps layout at 390/320 when system font is enlarged) — decide consciously, it overrides the user's font scale inside the page | RNW-REF |
| C9 | D.1/SM1.5 | `modules/webview-webauthn`: the documented way to touch the Android `WebView` settings is a `RNCWebViewManager`/`RNCWebView` subclass used via `nativeConfig` — apply `setWebAuthenticationSupport` in `createViewInstance` (before the first load). Fabric note: the custom component receives codegen props and `newSource` | RNW-ANDROID, RNW-REF `nativeConfig` |
| C10 | D.2 / SM1.3 | **More sheet = an expo-router `formSheet` route** (native sheet; web view stays mounted under it); not `@gorhom/bottom-sheet` (v5 is written against Reanimated 3 + RNGH 2). Android caps at 3 detents | expo-router modals docs; gorhom README |
| C11 | D.1 | Keep the custom pill bar (NativeTabs is still `expo-router/unstable-native-tabs`, and each tab is its own route — incompatible with one persistent web view). On iOS 26 render the pill with `expo-glass-effect` `GlassView` when `isGlassEffectAPIAvailable()`; do **not** set `UIDesignRequiresCompatibility` | native-tabs + glass-effect docs |
| C12 | D.6 | Android: create notification channels (one per topic group) before `getDevicePushTokenAsync` — the Android 13 permission prompt doesn't appear until a channel exists; `setNotificationHandler` must answer within 3 s; cold-start taps via `getLastNotificationResponseAsync`; category IDs without `:`/`-` | NOTIF |
| C13 | D.6 / SM4.4 | Live Activity tokens: per-activity `instance.getPushToken()` + `addPushTokenListener`, and app-wide push-to-start token (`addPushToStartTokenListener`) → register both in `live_activities`; `enablePushNotifications: true` in the `expo-widgets` plugin; countdowns use auto-updating `Text date` so the server pushes state changes, not ticks | WIDGETS; `@expo/ui` Text docs |
| C14 | D.7 | Set `expo.scheme` = the callback scheme used by `/native-auth` (iOS requires the redirect to use it); don't add a `Linking` listener on iOS for the auth session; on Android `warmUpAsync`/`mayInitWithUrlAsync` before opening | https://docs.expo.dev/versions/latest/sdk/webbrowser |
| C15 | D.10 | DOM-component chart: push price ticks through `useDOMImperativeHandle` methods, not props (every prop change re-renders the whole DOM tree over an async bridge); one island per screen; it runs in `@expo/dom-webview` by default | DOM |
| C16 | D.8 | `eas.json`: `cli.appVersionSource: "remote"` + `autoIncrement`; per-profile `environment`; `google-services.json` as an EAS secret *file* variable; `submit.testflight.ios.ascAppId`; `eas submit --groups "<internal group>"`; dev builds on the owner's iPhone need `eas device:create` then an interactive build | EAS docs |
| C17 | D.1 | Startup: Metro `inlineRequires` + Expo tree shaking; `expo-observe` `markInteractive()` on the web `ready` message as our cold-start TTI metric | tree-shaking + observe docs |
| C18 | SM4.1 | Uniwind theme = `global.css` `@layer theme { :root { @variant light {…} @variant dark {…} } }` generated from `packages/tokens`; `Uniwind.setTheme()` follows the web `theme` message; `useCSSVariable` for JS-side colours (tab bar, status bar); free tier needs `SafeAreaListener → Uniwind.updateInsets` | Uniwind docs |

---

## 1. Expo SDK 57 — config, config plugins, local modules

### 1.1 Recommended pattern
- SDK 57 pairs with `react-native 0.86` and `react 19.2.3` (bare-upgrade diff 56→57: `expo ~57.0.1`, RN `0.86.0`) —
  https://docs.expo.dev/bare/upgrade. New Architecture is always on from SDK 55 (RN ≥ 0.82 removed the opt-out);
  `newArchEnabled: false` is ignored — https://docs.expo.dev/guides/new-architecture.
- Variants: dynamic `app.config` reading a non-`EXPO_PUBLIC` env var (`APP_VARIANT`) to switch name, `ios.bundleIdentifier`,
  `android.package` — https://docs.expo.dev/build-reference/variants, https://docs.expo.dev/eas/environment-variables/manage.
  Such variables must be at least "sensitive" visibility if the config is resolved locally by EAS CLI (same page).
- Config plugins in TS: `app.config.ts` can reference `./plugins/withX.ts` (`import "tsx/cjs"` at top); mods such as
  `withAndroidManifest` edit native files at prebuild — https://docs.expo.dev/config-plugins/plugins.
- Local modules: `pnpm create expo-module --local` scaffolds Swift + Kotlin under `modules/` with autolinking; `--local`
  skips deps and example app — https://docs.expo.dev/workflow/customizing, https://docs.expo.dev/more/create-expo-module.
  Module shape: `Module` subclass with `definition() = ModuleDefinition { Name(..); Function(..); AsyncFunction(..) }`;
  Kotlin `AsyncFunction(..) Coroutine { }` for suspend code — https://docs.expo.dev/modules/module-api,
  https://docs.expo.dev/modules/shared-objects. Android Activity hooks via `ReactActivityLifecycleListener` —
  https://docs.expo.dev/modules/android-lifecycle-listeners.
- Monorepo: Metro monorepo support is automatic with `expo/metro-config` (manual `watchFolders` only before SDK 52);
  isolated installs supported from SDK 54; duplicate React in one app "will cause runtime errors", duplicate RN is
  unsupported; SDK 55+ enables `experiments.autolinkingModuleResolution` by default in monorepos (Metro resolves the
  same native module copy autolinking uses) — https://docs.expo.dev/guides/monorepos,
  https://docs.expo.dev/modules/autolinking. Fallback `nodeLinker: hoisted` in `pnpm-workspace.yaml` —
  https://docs.expo.dev/more/create-expo.

### 1.2 Performance
- Metro `inlineRequires: true` (with `experimentalImportSupport`) makes module evaluation lazy for faster startup; only
  use it with Expo tree shaking on — https://docs.expo.dev/guides/tree-shaking.
- `expo-observe` TTI: call `markInteractive()` when the screen is actually usable; only the first call per launch counts;
  route name auto-attached with expo-router — https://docs.expo.dev/eas/observe/reference/metrics.

### 1.3 Pitfalls
- `SplashScreen.preventAutoHideAsync()` must be called at module scope, not awaited, not in a hook, or it's too late —
  https://docs.expo.dev/versions/latest/sdk/splash-screen. Splash config must be tested in preview/production builds,
  not dev builds — https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon.
- `android.userInterfaceStyle` defaults to `light` and needs `expo-system-ui` — https://docs.expo.dev/versions/latest/config/app.
  Without it the Android shell will not follow dark mode before the web view paints.

### 1.4 Decisions
- `app.config.ts` + `plugins/` in TS; `APP_VARIANT` = `testnet|mainnet` plus the EAS profile; bundle IDs per D.8.
- Root `_layout.tsx`: module-scope `preventAutoHideAsync()`, `SystemUI.setBackgroundColorAsync(<theme bg>)` at module scope
  (https://docs.expo.dev/versions/latest/sdk/system-ui), hide splash on bridge `ready` (fallback 4 s [I]) and call
  `markInteractive({ routeName: path })` then.
- `metro.config.js`: tree shaking + `inlineRequires` (C17); accounts/viem subpath imports (already in SM3.1).
- `userInterfaceStyle: "automatic"` (root + android) and `expo-system-ui` plugin; splash `backgroundColor` + `dark`
  variant = Masayume light/dark backgrounds (C6).
- Monorepo: keep plan; also add a CI check that `pnpm why react` resolves a single React for `mobile/` [I].
- Local modules: `modules/hardware-keys` uses `AsyncFunction` (Kotlin `Coroutine`) for sign/create so key ops never block
  the JS thread [I: docs show AsyncFunction runs off the calling thread for module functions; View-bound AsyncFunction runs
  on the UI thread].

---

## 2. expo-router — layouts, `+native-intent`, sheets, native tabs

### 2.1 Pattern
- `src/app/+native-intent.tsx` exports `redirectSystemPath({ path, initial })`; it must never throw (return a fallback
  route); `path` "is not guaranteed" to be a path or valid URL — https://docs.expo.dev/router/advanced/native-intent.
- Deep links are enabled for all routes automatically — https://docs.expo.dev/linking/overview. AASA shape for
  applinks + webcredentials — https://docs.expo.dev/linking/ios-universal-links. `Linking.clearInitialURL()` exists
  (iOS/Android) — https://docs.expo.dev/versions/latest/sdk/linking.
- Sheets: `Stack.Screen options={{ presentation: 'formSheet', sheetAllowedDetents: [..] | 'fitToContents',
  sheetGrabberVisible, sheetCornerRadius, sheetLargestUndimmedDetentIndex }}`; Android supports at most 3 detents;
  array must be ascending — https://docs.expo.dev/router/advanced/modals, https://docs.expo.dev/versions/latest/sdk/router.
- Native tabs: `NativeTabs` from `expo-router/unstable-native-tabs` (still the import path in latest docs); iOS gives
  re-tap scroll-to-top and pop-to-top; `disabled` from SDK 56 — https://docs.expo.dev/router/basics/navigation-layouts,
  https://docs.expo.dev/versions/latest/sdk/router/native-tabs, https://docs.expo.dev/router/advanced/native-tabs.
- Status bar per screen (`statusBarStyle`); `statusBarBackgroundColor`/`statusBarTranslucent` deprecated because Android
  SDK ≥ 35 is edge-to-edge by default — https://docs.expo.dev/versions/latest/sdk/router.

### 2.2 Performance
- A `formSheet` is a native presentation over the stack, so the web view screen underneath stays mounted [I: native
  stack keeps the presenting screen]; no JS animation, so no frame drops from our JS thread.

### 2.3 Pitfalls
- NativeTabs model = one route per tab. Our architecture is one web view for every tab → NativeTabs would either mount
  several web views or need a hack. Keep the custom PillTabBar (C11).
- iOS 26 Liquid Glass: headers become glass by default; `UIDesignRequiresCompatibility: true` disables it globally
  (temporary workaround) — https://docs.expo.dev/router/advanced/stack. We should *adopt* glass, not opt out.

### 2.4 Decisions
- Routes: `_layout.tsx` (Stack) → `index.tsx` (the WebShell), `more.tsx` (formSheet, detents `[0.5, 1]`, grabber),
  `lock.tsx` (fullScreenModal), `offline.tsx`, `settings.tsx`. The More sheet is native (C10).
- `+native-intent.tsx`: allowlist check (from `packages/core/src/shell/routes.ts`); for an allowed web path return
  `'/'` and stash the path for WebShell to `navigate` (initial: set the web view's first `source` URI to that path, so no
  double load) [I]; `/native-auth*` and custom-scheme `auth` go to the auth-session resolver; anything else → `'/'`.
- Pill on iOS 26: `GlassView` from `expo-glass-effect` gated on `isGlassEffectAPIAvailable()`
  (https://docs.expo.dev/versions/latest/sdk/glass-effect); Android: solid token surface — `expo-blur` on Android is a
  translucent tint unless `blurMethod`/`blurTarget` are set (https://docs.expo.dev/versions/latest/sdk/blur-view), and
  blurring a WebView target is not worth the cost [I].

---

## 3. react-native-webview (13.16.x) — the shell

### 3.1 Pattern (from the docs)
- Web → native: `window.ReactNativeWebView.postMessage(string)`; only injected if `onMessage` is set; one string arg —
  RNW-GUIDE. Native → web: `injectJavaScript()` (method) or `injectedJavaScript` (prop) — RNW-GUIDE.
- `injectedJavaScriptBeforeContentLoaded`: runs after the document element is created, before content; on Android "may
  work but is not 100% reliable; consider `injectedJavaScriptObject`" — RNW-REF. `injectedJavaScriptObject` is exposed as
  `window.ReactNativeWebView.injectedObjectJson()` — RNW-GUIDE. `injectedJavaScriptForMainFrameOnly` must be `true` on
  Android — RNW-REF.
- `onMessage` `nativeEvent.url`: iOS = URL of the frame that sent the message; Android = `sourceOrigin` from
  `WebMessageListener`; Android registers the listener with allowed origins `Set.of("*")` and ignores `isMainFrame`
  (fallback `addJavascriptInterface` has no restriction either) — src/WebViewTypes.ts, android/.../RNCWebView.java.
- `originWhitelist`: matched against origin only; non-whitelisted navigations "handled by the OS"; default
  `['http://*','https://*']` — RNW-REF.
- `onShouldStartLoadWithRequest`: return false to block; **not called on the first load on Android**;
  `isTopFrame`, `navigationType`, `mainDocumentURL`, `hasTargetFrame` are iOS-only — RNW-REF.
- `onNavigationStateChange` gives url/title/loading/canGoBack — RNW-GUIDE (SPA pushState changes are not a reliable
  signal [I] → our explicit `route-changed` message is the right design).
- `applicationNameForUserAgent` appends to the system UA on both platforms — RNW-REF.
- Termination: `onContentProcessDidTerminate` (iOS) — "not necessarily a crash; can occur when the OS frees memory from
  background WebViews"; example reloads — RNW-REF. `onRenderProcessGone` (Android, API ≥ 26), `nativeEvent.didCrash` —
  RNW-REF.
- Cookies: `sharedCookiesEnabled` (iOS/macOS only, default false) uses `NSHTTPCookieStorage.sharedHTTPCookieStorage` for
  every load — recommended when *setting cookies from RN*; `thirdPartyCookiesEnabled` Android, default true — RNW-REF,
  RNW-GUIDE.
- `pullToRefreshEnabled` iOS only (also forces `bounces`) — RNW-REF.
- `cacheEnabled` default true (all platforms); `cacheMode` Android (`LOAD_DEFAULT` default,
  `LOAD_CACHE_ELSE_NETWORK`, …) — RNW-REF.
- `textZoom` (Android): set 100 to stop system font size from scaling the page — RNW-REF.
- `androidLayerType`: `none` default, `hardware`, `software` — RNW-REF.
- `startInLoadingState` + `renderLoading` for a first-load overlay — RNW-REF.
- `webviewDebuggingEnabled` for Chrome/Safari inspect — https://github.com/react-native-webview/react-native-webview/blob/master/docs/Debugging.md.
- `enableApplePay` disables `injectJavaScript`, `injectedJavaScript*`, `sharedCookiesEnabled`, history — RNW-REF (never
  enable; it would kill the bridge).
- Custom Android WebView: subclass `RNCWebViewManager`/`RNCWebView`/`RNCWebViewClient`, render via
  `nativeConfig={{ component }}`; under Fabric the custom component receives codegen props, `source` arrives as
  `newSource` — RNW-ANDROID, RNW-REF.

### 3.2 Performance / no-white-flash
- iOS `setBackgroundColor`: alpha = 1 → `opaque = YES` on the view, web view and scroll view; alpha < 1 → non-opaque
  (more compositing) — apple/RNCWebViewImpl.m. Android: inner WebView is always `TRANSPARENT`, the wrapper's background
  shows through — RNCWebViewWrapper.kt. ⇒ give the WebView (iOS) and its container (Android) the theme's opaque
  background colour, and let the web's first paint match it (server-rendered shell mode via the `cwf.shell` cookie).
- Keep the **one** WebView mounted for the app's lifetime (tabs = `navigate` messages, never remounts) — this is the
  main tab-switch performance lever [I, design].
- Leave `cacheEnabled` on; `LOAD_DEFAULT` is right for a Next.js app with hashed assets [I]; use
  `LOAD_CACHE_ELSE_NETWORK` only for the offline retry path [I].
- Don't use `startInLoadingState` (it paints an RN overlay then swaps → a visible flash); keep the native splash up until
  `ready` instead [I, C6].
- `androidLayerType: 'hardware'` only if profiling shows scroll jank — docs give no default recommendation [I].

### 3.3 Pitfalls
- C1 (Android pre-content injection unreliable), C2 (Android origin `*`), C3 (PTR iOS-only), C5 (termination),
  `onShouldStartLoadWithRequest` skipped on Android first load (so the initial `source` must itself be validated) and no
  `isTopFrame` (iframe loads hit the handler on Android too [I] — never `Linking.openURL` a sub-frame request).
- `originWhitelist` narrow + external links: the library opens non-whitelisted URLs via the OS before our handler can
  route them to SFSafariViewController [I — verify in SM1.3; if true, set `originWhitelist={['*']}` and enforce the
  origin rule inside `onShouldStartLoadWithRequest`].

### 3.4 Decisions (D.2 rewrite points)
- Props: `source={{ uri: initialUrl }}`, `applicationNameForUserAgent`, `injectedJavaScriptBeforeContentLoaded` (iOS) +
  `injectedJavaScriptObject={{ platform, variant, version, bridge: 1 }}` (both; C1), `onMessage` (exact origin check,
  64 KB cap, zod), `onShouldStartLoadWithRequest` (routing table), `allowsBackForwardNavigationGestures`,
  `setSupportMultipleWindows={false}`, `textZoom={100}` (C8), `backgroundColor` token, `bounces` (iOS),
  `pullToRefreshEnabled` (iOS), `onContentProcessDidTerminate`, `onRenderProcessGone`, `webviewDebuggingEnabled` only in
  `development`. Remove `sharedCookiesEnabled` (C4).
- Android pull-to-refresh: web-side pull-to-refresh component enabled only when `__CWF_SHELL__.platform === 'android'` [I]
  (a native `SwipeRefreshLayout` wrapper conflicts with inner scroll containers [I]).
- Native → web messages: one `injectJavaScript("window.__cwfBridge?.receive(<json>);true;")` helper [I]; queue until
  `ready`.
- App-state `background` → web; on `active` after a termination event, remount.

---

## 4. expo-notifications — raw APNs/FCM from our notifier

### 4.1 Pattern
- `getDevicePushTokenAsync()` instead of `getExpoPushTokenAsync()` when sending via APNs/FCM directly —
  https://docs.expo.dev/push-notifications/sending-notifications-custom. Same page: APNs HTTP/2 with ES256 JWT
  (`iss` team, `kid` key), `api.sandbox.push.apple.com` for development, `api.push.apple.com` for production;
  FCM HTTP v1 `projects/<id>/messages:send` with an OAuth token (google-auth-library JWT, `cloud-platform` scope).
- Config plugin `expo-notifications` (icon, color, `defaultChannel`, sounds, `enableBackgroundRemoteNotifications`) —
  NOTIF; plugin is the recommended way to get the APNs entitlement —
  https://docs.expo.dev/push-notifications/sending-notifications-custom; `android.googleServicesFile` required for FCM —
  https://docs.expo.dev/push-notifications/fcm-credentials.
- Foreground: `setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner, shouldShowList,
  shouldPlaySound, shouldSetBadge }) })`; if it doesn't answer within 3 s the notification is not shown — NOTIF.
- Taps: `addNotificationResponseReceivedListener`; cold start: `getLastNotificationResponseAsync()` — NOTIF,
  https://docs.expo.dev/push-notifications/push-notifications-setup.
- Categories: `setNotificationCategoryAsync(id, actions, options)`; id must not contain `:` or `-` — NOTIF.
- Background JS on push: `registerTaskAsync` + `TaskManager.defineTask` at module scope; OS may not deliver; Apple advises
  ≤ 2–3 background pushes/hour — NOTIF.

### 4.2 Performance
- Register listeners and the handler at module scope in the root layout (not inside the WebView screen) so a cold-start
  tap is handled before the web view is ready; queue `push-opened` until `ready` [I].
- Avoid background-task pushes for our topics; visible alerts with `path` in the payload are enough [I].

### 4.3 Pitfalls
- Android 13+: the permission prompt does not appear until at least one channel exists; `setNotificationChannelAsync`
  must be called before getting a token — NOTIF.
- TestFlight builds use production APNs; dev builds sandbox (matches D.6).
- `aps-environment` missing error → rebuild with EAS so it regenerates the push key —
  https://docs.expo.dev/push-notifications/faq.

### 4.4 Decisions
- Channels created at app start (cheap, no prompt): `calls` (verdicts, fills), `money` (vault, bridge, payouts),
  `social` (duels, X), `alerts` (price alerts), `launch` [I]; notifier sets `android.notification.channel_id` per topic —
  gives users OS-level per-topic control and matches `push_prefs`.
- Permission flow stays "after the first call placed" (D.6): check `getPermissionsAsync()` first, then ask.
- Token rotation: `Notifications.addPushTokenListener` → re-POST `/api/push/register` [I: listener name from the API
  reference, not in the retrieved extract — confirm at SM2.1].
- Foreground handler: show banner for verdict/fill, suppress when the web route already shows that market (web tells
  native the current path via `route-changed`) [I].
- Categories for verdict (`View`, `Claim`) — no `-` in IDs (`verdict_ready`).

---

## 5. expo-widgets — Live Activity + home-screen widget (SM4.4)

### 5.1 Pattern
- `import { createWidget, createLiveActivity } from 'expo-widgets'`; layout functions carry the `'widget'` directive and
  return SwiftUI trees built with `@expo/ui/swift-ui` (+ modifiers); Live Activity returns `banner`, `compactLeading`,
  `compactTrailing`, `minimal`, `expandedLeading/Trailing/Bottom`; receives `LiveActivityEnvironment` (`colorScheme`) —
  WIDGETS.
- Start/update: `Activity.start(props)` returns an instance; `instance.getPushToken()`,
  `instance.addPushTokenListener(ev => ev.pushToken)`; `addPushToStartTokenListener(ev => ev.activityPushToStartToken)`
  for server-started activities; requires `enablePushNotifications: true` — WIDGETS.
- Widgets: `Widget.updateSnapshot(props)` (single entry) and `Widget.updateTimeline([{date, props}, …])` — WIDGETS.
- Plugin: `bundleIdentifier` (default `<app>.ExpoWidgetsTarget`), `groupIdentifier` (default `group.<app>`; "required"),
  `enablePushNotifications` (adds `aps-environment` + Info.plist flag), `widgets[]` with `name`, `displayName`,
  `description`, `contentMarginsDisabled`, `supportedFamilies` (system small/medium/large, accessory circular/rectangular/
  inline) — WIDGETS.
- `@expo/ui` `Text` with `date` + `dateStyle` auto-updates as time passes — "especially useful in widgets and Live
  Activities" — https://docs.expo.dev/versions/latest/sdk/ui/swift-ui/text.

### 5.2 Performance
- Countdown to lock/expiry = `Text date` (system-rendered), so the notifier pushes only on state changes (price bucket,
  lock, verdict), respecting APNs Live Activity budgets [I].
- Widget: `updateTimeline` with the known future states (lock time, expiry) instead of frequent snapshots [I].

### 5.3 Pitfalls
- Push token APIs are documented as iOS-only; the retrieved docs don't cover an Android widget path [I: plan the Android
  home widget separately or mark it iOS-only in MOB-12's acceptance].
- The widget extension is its own bundle ID → needs its own provisioning (EAS handles extension targets it knows about)
  and the App Group must be enabled for both IDs [I; verify in the first SM4 build].

### 5.4 Decisions
- Plugin: `bundleIdentifier: <bundle>.testnet.widgets`, `groupIdentifier: group.<bundle>.testnet`,
  `enablePushNotifications: true`, widgets `PortfolioWidget` (systemSmall/Medium) and a lock-screen
  `accessoryRectangular` open-call widget.
- `live_activities` table stores both the per-activity token and the push-to-start token (C13); `apns-topic`
  `<bundle>.push-type.liveactivity` already in D.6.

---

## 6. expo-local-authentication — app lock (SM2.4)

- Plugin option `faceIDPermission`; without `NSFaceIDUsageDescription`, Face ID devices fall back to passcode —
  https://docs.expo.dev/versions/latest/sdk/local-authentication.
- `hasHardwareAsync()`, `isEnrolledAsync()`, `getEnrolledLevelAsync()` (pre-M Android can report `SECRET` for SIM lock
  only) — same page.
- Decisions: set `faceIDPermission`; offer the lock only when `hasHardwareAsync && isEnrolledAsync`; the lock screen is a
  `fullScreenModal` route over the (still mounted) web view; the app-switcher cover is a plain opaque native view shown on
  `AppState` `inactive` [I].

---

## 7. expo-web-browser — auth sessions and external links

- `openAuthSessionAsync(url, redirectUrl, { preferEphemeralSession })`: iOS `ASWebAuthenticationSession` (redirect must
  use the app's `expo.scheme`; `Linking.addEventListener` not needed and "can have side effects"), Android Custom Tabs +
  AppState + Linking; resolves `cancel`/`dismiss`/`success` — https://docs.expo.dev/versions/latest/sdk/webbrowser.
- `openBrowserAsync`: SFSafariViewController / Custom Tab; SFSafariViewController doesn't share cookies with Safari —
  same page. `mayInitWithUrlAsync(url)` (Android) pre-launches the Custom Tabs session — same page.
- Decisions (C14): `scheme: '<bundle>.testnet'` [I: must equal the `/native-auth` redirect scheme]; X bind uses
  `preferEphemeralSession: false` so an existing X login in Safari is reused [I]; `open-external` →
  `openBrowserAsync` with toolbar colour from tokens; call `mayInitWithUrlAsync` when the web shows an X-bind button [I].

---

## 8. expo-haptics

- `selectionAsync`, `impactAsync(Light|Medium|Heavy|Rigid|Soft)`, `notificationAsync(Success|Warning|Error)`; Android
  `performAndroidHapticsAsync(AndroidHaptics.Confirm|Reject|Segment_Tick|Toggle_On…)` uses the system haptic engine —
  https://docs.expo.dev/versions/latest/sdk/haptics.
- Decision: bridge `haptic.kind` map — iOS: select→`selectionAsync`, success/warning/error→`notificationAsync`,
  impact→`impactAsync(Light)`; Android: select→`Segment_Tick`, success→`Confirm`, error→`Reject`, warning→
  `notificationAsync(Warning)`, impact→`Context_Click` [I: platform-native feel]. Fire-and-forget (don't await in the
  message handler).

---

## 9. react-native-mmkv v4

- v4 is a Nitro Module: install `react-native-mmkv react-native-nitro-modules`; create with `createMMKV({ id, path,
  encryptionKey, encryptionType: 'AES-256', mode, readOnly, compareBeforeSet })`; export and reuse one instance; v3→v4
  has an upgrade guide — https://github.com/margelo/react-native-mmkv/blob/main/README.md,
  https://github.com/margelo/react-native-mmkv/blob/main/docs/V4_UPGRADE_GUIDE.md.
- Decisions: two instances — `shell` (unencrypted: last path, theme, insets, lock prefs; read synchronously at startup to
  build the first `source` URI and background colour → no flash) and `account` (encrypted, key from `expo-secure-store`)
  for SM3 `IntentStore` [I]. Use `createMMKV` (not the v3 `new MMKV()`).

---

## 10. EAS Build / Submit

- `eas.json`: `cli.appVersionSource: "remote"`; profiles with `developmentClient`, `distribution: internal|store`,
  `autoIncrement`, `environment`, `env`, `cache`, `extends`; Android `buildType: 'apk' | 'app-bundle'` —
  https://github.com/expo/eas-cli/blob/main/packages/eas-json/src/build/schema.ts, …/build/types.ts,
  …/eas-cli/src/commandUtils/new/projectFiles.ts.
- `environment` field picks EAS env vars; default production for `store`, development for dev client, preview otherwise —
  https://docs.expo.dev/eas/environment-variables/usage. Secret *file* variables (e.g. `GOOGLE_SERVICES_JSON`) feed
  `googleServicesFile` — https://docs.expo.dev/eas/environment-variables/manage.
- iOS internal (ad hoc) builds need devices registered with `eas device:create`; non-interactive builds reuse the old
  profile unless `--refresh-ad-hoc-provisioning-profile` (EAS CLI ≥ 19.1.0, needs an ASC API key); otherwise run
  `eas build` interactively with Apple login — https://docs.expo.dev/build/internal-distribution.
- TestFlight: `eas build -p ios --auto-submit`; `eas submit -p ios --groups "<internal group>" --what-to-test "…"`
  (`--groups` = internal groups only); `ascAppId` for non-interactive — https://docs.expo.dev/submit/testflight,
  https://docs.expo.dev/build-reference/npx-testflight, https://docs.expo.dev/eas/json. EAS Workflows `testflight` job
  with `internal_groups`/`external_groups` (external implies `submit_beta_review: true`) —
  https://docs.expo.dev/submit/testflight.
- Submit ASC API key: `ascApiKeyPath` + `ascApiKeyIssuerId` + `ascApiKeyId` all-or-nothing —
  https://github.com/expo/eas-cli/blob/main/packages/eas-cli/src/submit/ios/IosSubmitCommand.ts.
- Decisions (C16): profiles `development` (dev client, internal, `APP_VARIANT=testnet`, environment development),
  `preview` (Android `buildType: apk`, internal), `testflight` (store, `autoIncrement`, environment production);
  `submit.testflight.ios.ascAppId`; `eas submit --groups` with the internal group name; `GOOGLE_SERVICES_JSON` secret
  file. Individual-account caveat from D.8 stands (interactive Apple ID login for provisioning).

---

## 11. Expo DOM components (chart island, SM4.2)

- `'use dom'` file; props are serializable and "re-render the entire React tree of the DOM component" across an
  asynchronous bridge; functions only as top-level async props ("native actions"); no `children`; instances don't share
  data; native views can't be placed inside; embedded only, no OTA; Expo recommends truly native views where possible —
  DOM. `dom={{ matchContents: true }}` auto-sizes; `dom` passes WebView props (e.g. `scrollEnabled: false`); default
  runtime is `@expo/dom-webview`, opt out with `useExpoDOMWebView: false` — DOM. `useDOMImperativeHandle` (SDK 53+, ref
  as a prop) exposes methods callable from native — DOM.
- Decisions (C15): chart props = static config only (market id, theme, range); live ticks via a ref method
  `pushTicks(batch)` batched per animation frame [I]; `dom={{ scrollEnabled: false }}`, fixed height (no
  `matchContents` re-measure on every tick) [I]; one island per screen; keep `@expo/dom-webview` default (lighter than a
  second react-native-webview [I]).

---

## 12. Uniwind (SM4.1/SM4.3)

- Theme via CSS variables in `global.css`: `@layer theme { :root { @variant light {…} @variant dark {…} } }`; classes
  like `bg-card text-foreground` adapt without `dark:`; custom themes must define all the same variables and be listed
  in `extraThemes` of `withUniwindConfig(config, { cssEntryFile: './global.css', polyfills: { rem }, extraThemes })`
  (`cssEntryFile` must be a relative string) — https://github.com/uni-stack/uniwind/blob/main/skills/uniwind/references/theming.md,
  https://github.com/uni-stack/uniwind/blob/main/skills/migrate-nativewind-to-uniwind/SKILL.md.
- `Uniwind.setTheme('light'|'dark'|'system'|custom)`; `useUniwind()` → `{ theme, hasAdaptiveThemes }`;
  `useCSSVariable('--x' | ['--a','--b'])` re-renders only when the value changes; `updateCSSVariables` is web-only
  (no-op on native) — https://github.com/uni-stack/uniwind/blob/main/_autodocs/hooks.md, …/_autodocs/core-config.md.
- `withUniwind(Component)` maps `className` for third-party components (replaces NativeWind `cssInterop`) — migrate skill.
- Styles computed at build time (library description); Pro injects styles into the ShadowTree bypassing re-renders,
  Reanimated 4 transitions, automatic insets; Free needs `SafeAreaProvider` + `SafeAreaListener` →
  `Uniwind.updateInsets` — https://github.com/uni-stack/uniwind/blob/main/skills/uniwind/references/pro.md,
  …/variants-and-selectors.md.
- Decisions (C18): `packages/tokens` generates the `@variant light/dark` blocks from Masayume CSS custom properties
  (names kept identical to the web's, so the check in SM4.1 is a diff); theme follows the web `theme` message via
  `Uniwind.setTheme`; tab bar/status bar colours via `useCSSVariable`; Free tier + the SafeAreaListener pattern (no paid
  dependency needed) [I]. Runtime token overrides aren't possible on native (`updateCSSVariables` web-only) — themes are
  build-time.

---

## 13. Reanimated 4 / Gesture Handler / sheets

- Reanimated 4 needs `react-native-worklets`; Babel plugin is `react-native-worklets/plugin` (replaces
  `react-native-reanimated/plugin`) — https://docs.swmansion.com/react-native-reanimated/docs/reanimated-babel-plugin/about,
  …/fundamentals/getting-started [I: `babel-preset-expo` configures it automatically in current SDKs — verify].
- New-Arch perf: animate non-layout props; static flags `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS` (4.0+) /
  `IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS` (4.2+) for many simultaneous animations (can affect touch detection → use RNGH
  `Pressable`); `USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS` (RN ≥ 0.80, Reanimated ≥ 4.2) for scroll FPS — flags in
  `package.json` `reanimated.staticFeatureFlags` — https://docs.swmansion.com/react-native-reanimated/docs/guides/performance,
  …/guides/feature-flags.
- `@gorhom/bottom-sheet` v5 "written with Reanimated v3 & Gesture Handler v2" —
  https://github.com/gorhom/react-native-bottom-sheet/blob/master/README.md. Software Mansion's
  `@swmansion/react-native-bottom-sheet` offers `ModalBottomSheet` with detents incl. `'content'`, `BottomSheetProvider`,
  and `nativeOverlay` (UIWindow container on iOS, edge-to-edge dialog on Android) —
  https://github.com/software-mansion-labs/react-native-bottom-sheet/blob/main/_autodocs/configuration.md,
  …/docs/content/modal-sheets.mdx.
- Decisions: pill tab bar animations (active indicator slide, press scale) = Reanimated shared values on
  `transform`/`opacity` only; RNGH `Pressable` for tabs. More sheet = expo-router `formSheet` (C10). Native confirmation
  sheet for SM3 root-signed sends = `formSheet` route too; reach for `@swmansion/react-native-bottom-sheet` only if an
  inline (non-route) sheet is needed in SM4 native screens.

---

## 14. Open items to prove (spikes / first builds)

1. RNW `originWhitelist` vs `onShouldStartLoadWithRequest` ordering (C7) — SM1.3.
2. Android `onRenderProcessGone`: reload vs remount (C5) — force with `chrome://crash` in a dev build.
3. `nativeConfig` custom Android WebView under Fabric with `WebSettingsCompat.setWebAuthenticationSupport` (C9) — X14.
4. `+native-intent` initial-path handoff without a double load — SM1.4.
5. expo-widgets extension provisioning + App Group on an individual Apple account — first SM4 build.
6. `addPushTokenListener` name/behaviour in expo-notifications 57 — SM2.1.
