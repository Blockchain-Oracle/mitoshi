// The app: one web view on the testnet site (D-227, MOBILE; docs/specs/mobile.md D.2, the owner's call — the web is
// already phone-first, so the app is that site in a native frame). What the frame adds:
//   - the native splash held until the page has painted (inject.ts `ready`), on the theme's ground: no white frame;
//   - safe areas: iOS lets the page reach the edges (the web pads with env(safe-area-inset-*), viewport-fit=cover);
//     Android pads the system bars and the keyboard natively (its WebView's env() insets aren't dependable);
//   - the status bar and the root view follow the page's theme (inject.ts `theme`);
//   - Android's Back walks the page's history, then leaves the app; iOS swipes back from the left edge;
//   - other sites (and the guides) open in the in-app browser over the app, other schemes (mail, wallets) in their
//     apps (links.ts);
//   - round 7 (the owner's TestFlight review, Senryo's app as the model): the page's sounds play through a playback
//     audio session, its haptics on the Taptic Engine (feedback.ts), it opens on Markets, and an optional Face ID lock
//     guards the app (face-id.ts);
//   - files a page downloads go to the share sheet (save-file.ts);
//   - an offline screen with Retry that also retries by itself when the connection returns;
//   - passkeys: iOS through the webcredentials association, Android through the WebView WebAuthn module.
// Pull-to-refresh is off on purpose: the terminal's chart and level handles, the games' stages and the drawers all
// take vertical drags, and a refresh gesture over them would reload the page mid-trade.
import * as Network from "expo-network";
import * as WebBrowser from "expo-web-browser";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, BackHandler, findNodeHandle, Keyboard, Linking, Platform, StyleSheet, useColorScheme, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import type { ShouldStartLoadRequest, WebViewHttpErrorEvent, WebViewOpenWindowEvent } from "react-native-webview/lib/WebViewTypes";
import { enableWebViewPasskeys } from "../../modules/webview-webauthn";
import { RP_ID, SCHEME, USER_AGENT_MARK, WEB_ORIGIN } from "./config";
import { LOCK } from "./copy";
import { playHaptic, startAudioSession } from "./feedback";
import { SHELL_SCRIPT } from "./inject";
import { HOME_PATH, isOurHost, parseUrl, routeOf, startUrl } from "./links";
import { Lock } from "./LockScreen";
import { authenticate, biometricsReady, lockEnabled, RELOCK_AFTER_MS, setLock } from "./face-id";
import { parseMessage } from "./messages";
import { Offline, type OfflineKind } from "./Offline";
import { GATEWAY, probe } from "./probe";
import { saveFile } from "./save-file";
import { palette, type Mode } from "./theme";

/** The splash lifts on `ready`; this is the cap if a page never says so (a slow network shows the page as it comes). */
const SPLASH_CAP_MS = 8_000;
/** After the load ends, `ready` normally lands within a frame or two; this is the fallback's wait. */
const LOAD_END_GRACE_MS = 600;

const HOME = `${WEB_ORIGIN}${HOME_PATH}`;

/** Another site (or the guides): the in-app browser (SFSafariViewController / Custom Tabs), over the app; any other scheme to its app. */
function openOutside(url: string, mode: Mode): void {
  if (/^https?:/i.test(url)) {
    const c = palette(mode);
    WebBrowser.openBrowserAsync(url, { controlsColor: c.accent, toolbarColor: c.ground, dismissButtonStyle: "close", enableBarCollapsing: true }).catch(() => {
      Linking.openURL(url).catch(() => undefined);
    });
    return;
  }
  Linking.openURL(url).catch(() => undefined);
}

export function Shell() {
  const os = useColorScheme();
  const insets = useSafeAreaInsets();
  const network = Network.useNetworkState();
  const [mode, setMode] = useState<Mode>(os === "light" ? "light" : "dark");
  const modeNow = useRef(mode);
  modeNow.current = mode;
  const [source, setSource] = useState<string | null>(null);
  const [mount, setMount] = useState(0);
  const [failure, setFailure] = useState<OfflineKind | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [keyboard, setKeyboard] = useState(0);
  const web = useRef<WebView>(null);
  const holder = useRef<View>(null);
  const canGoBack = useRef(false);
  const lastUrl = useRef<string | null>(null);
  const splashUp = useRef(true);
  const passkeysFor = useRef(-1);
  const [locked, setLocked] = useState(false);
  const leftAt = useRef<number | null>(null);

  const hideSplash = useCallback(() => {
    if (!splashUp.current) return;
    splashUp.current = false;
    SplashScreen.hide();
  }, []);

  // The first page: the link that opened the app (a universal/App Link or mitoshi://), else the site's root.
  useEffect(() => {
    Linking.getInitialURL()
      .then((link) => setSource(startUrl(link, WEB_ORIGIN, RP_ID, SCHEME)))
      .catch(() => setSource(HOME));
    startAudioSession();
    lockEnabled().then((on) => on && setLocked(true)).catch(() => undefined);
    const cap = setTimeout(hideSplash, SPLASH_CAP_MS);
    return () => clearTimeout(cap);
  }, [hideSplash]);

  // A link that arrives while the app runs opens in the same web view.
  const go = useCallback((url: string) => {
    if (failure || !web.current) {
      setSource(url);
      setMount((m) => m + 1);
      return;
    }
    web.current.injectJavaScript(`location.assign(${JSON.stringify(url)});true;`);
  }, [failure]);
  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => go(startUrl(url, WEB_ORIGIN, RP_ID, SCHEME)));
    return () => sub.remove();
  }, [go]);

  // The Face ID lock asks again when the app comes back after a while (face-id.ts RELOCK_AFTER_MS).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") leftAt.current = Date.now();
      if (state !== "active" || leftAt.current === null) return;
      const away = Date.now() - leftAt.current;
      leftAt.current = null;
      if (away >= RELOCK_AFTER_MS) lockEnabled().then((on) => on && setLocked(true)).catch(() => undefined);
    });
    return () => sub.remove();
  }, []);
  const unlock = useCallback(() => {
    authenticate(LOCK.prompt).then((ok) => ok && setLocked(false)).catch(() => undefined);
  }, []);

  // The status bar is drawn by <StatusBar>; the root view (seen behind the keyboard and on rotation) follows too.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(palette(mode).ground).catch(() => undefined);
  }, [mode]);

  // Android Back: the page's history first (Next's client navigations are history entries), then the OS's default.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (failure || !canGoBack.current || !web.current) return false;
      web.current.goBack();
      return true;
    });
    return () => sub.remove();
  }, [failure]);

  // Android draws edge to edge, so the window no longer shrinks for the keyboard: the web view does, by its height
  // (React Native reports it above the navigation bar, which the frame already pads).
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (e) => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Android: a killed render process leaves a dead view; a fresh one opens where the reader was.
  const reopen = useCallback(() => {
    setSource(lastUrl.current ?? HOME);
    setMount((m) => m + 1);
  }, []);

  // Unknown reachability (the first moments) counts as online.
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const offlineNow = useRef(offline);
  useEffect(() => {
    offlineNow.current = offline;
  }, [offline]);

  // Try again: the offline screen stays, saying "Trying…", while one request checks the site is there (probe.ts); the
  // page reopens only when it is, so a failed try never blinks to an empty ground.
  const probing = useRef(false);
  const retry = useCallback(() => {
    if (probing.current) return;
    probing.current = true;
    setRetrying(true);
    probe().then((reach) => {
      probing.current = false;
      setRetrying(false);
      if (reach === "down") {
        setFailure(offlineNow.current ? "offline" : "down");
        return;
      }
      setFailure(null);
      setSource(lastUrl.current ?? source ?? HOME);
      setMount((m) => m + 1);
    });
  }, [source]);

  // The connection drives the screen while it shows: losing it says "offline" (a load that failed before the network
  // state was known said "can't reach"), and getting it back tries again without a tap.
  const wasOffline = useRef(offline);
  useEffect(() => {
    const back = wasOffline.current && !offline;
    wasOffline.current = offline;
    if (!failure) return;
    if (offline) {
      if (failure !== "offline") setFailure("offline");
    } else if (back) retry();
  }, [offline, failure, retry]);

  const fail = useCallback((kind: OfflineKind) => {
    setFailure(kind);
    setRetrying(false);
    hideSplash();
  }, [hideSplash]);

  // Passkeys in the Android web view: switched on for each new web view (the module is absent on iOS).
  const enablePasskeys = useCallback(() => {
    if (Platform.OS !== "android" || passkeysFor.current === mount) return;
    const tag = findNodeHandle(holder.current);
    if (tag == null) return;
    enableWebViewPasskeys(tag)
      .then((support) => {
        if (support === "app" || support === "unsupported" || support === "refused") passkeysFor.current = mount;
      })
      .catch(() => undefined);
  }, [mount]);

  const onShouldStart = useCallback((req: ShouldStartLoadRequest) => {
    // Frames inside the page (a wallet's iframe) load as the page asks; only the page's own navigation is routed.
    if (req.isTopFrame === false) return true;
    const route = routeOf(req.url, RP_ID);
    if (route === "inside") return true;
    openOutside(req.url, modeNow.current);
    return false;
  }, []);

  const onOpenWindow = useCallback((e: WebViewOpenWindowEvent) => {
    const url = e.nativeEvent.targetUrl;
    if (routeOf(url, RP_ID) === "inside" && parseUrl(url)?.scheme.startsWith("http")) go(url);
    else openOutside(url, modeNow.current);
  }, [go]);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    const from = parseUrl(e.nativeEvent.url);
    if (!from || !isOurHost(from.host, RP_ID)) return;
    const message = parseMessage(e.nativeEvent.data);
    if (!message) return;
    switch (message.type) {
      case "ready":
        setRetrying(false);
        hideSplash();
        return;
      case "theme":
        setMode(message.mode);
        return;
      case "open-external": {
        const url = message.url.startsWith("/") ? `${WEB_ORIGIN}${message.url}` : message.url;
        if (routeOf(url, RP_ID) === "inside") go(url);
        else openOutside(url, modeNow.current);
        return;
      }
      case "haptic":
        playHaptic(message.kind);
        return;
      case "face-id":
      case "face-id-state": {
        // The page learns the lock's state as an event (web/src/lib/app-shell.ts `useFaceIdLock`).
        const state = message.type === "face-id" ? setLock(message.enabled, LOCK.enablePrompt) : lockEnabled();
        Promise.all([state, biometricsReady()])
          .then(([on, ready]) => web.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent("cwf-shell",{detail:{faceIdLock:${on},biometrics:${ready}}}));true;`))
          .catch(() => undefined);
        return;
      }
      case "save-file":
        saveFile(message.name, message.mime, message.base64).catch(() => undefined);
        return;
    }
  }, [go, hideSplash]);

  const onNavigation = useCallback((nav: WebViewNavigation) => {
    canGoBack.current = nav.canGoBack;
    if (routeOf(nav.url, RP_ID) === "inside" && parseUrl(nav.url)?.scheme.startsWith("http")) lastUrl.current = nav.url;
  }, []);

  // A page that can't load at all (no network, DNS, TLS, the host down): iOS already drops cancelled loads (-999, 102).
  const onError = useCallback(() => fail(offline ? "offline" : "down"), [fail, offline]);

  const onHttpError = useCallback((e: WebViewHttpErrorEvent) => {
    if (GATEWAY.has(e.nativeEvent.statusCode)) fail("down");
  }, [fail]);

  const onLoadEnd = useCallback(() => {
    enablePasskeys();
    setTimeout(hideSplash, LOAD_END_GRACE_MS);
  }, [enablePasskeys, hideSplash]);

  const c = palette(mode);
  const android = Platform.OS === "android";
  const frame = android
    ? { paddingTop: insets.top, paddingBottom: insets.bottom + keyboard, paddingLeft: insets.left, paddingRight: insets.right }
    : null;

  return (
    <View style={[styles.root, { backgroundColor: c.ground }, frame]}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      {source ? (
        <View key={mount} ref={holder} collapsable={false} style={styles.fill} onLayout={enablePasskeys}>
          <WebView
            ref={web}
            source={{ uri: source }}
            style={styles.web}
            containerStyle={styles.fill}
            originWhitelist={["*"]}
            applicationNameForUserAgent={USER_AGENT_MARK}
            injectedJavaScriptBeforeContentLoaded={SHELL_SCRIPT}
            injectedJavaScript={SHELL_SCRIPT}
            onMessage={onMessage}
            onShouldStartLoadWithRequest={onShouldStart}
            onOpenWindow={onOpenWindow}
            onNavigationStateChange={onNavigation}
            onLoadEnd={onLoadEnd}
            onError={onError}
            onHttpError={onHttpError}
            renderError={() => <View />}
            onContentProcessDidTerminate={() => web.current?.reload()}
            onRenderProcessGone={reopen}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsLinkPreview={false}
            allowsBackForwardNavigationGestures
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
            bounces={false}
            overScrollMode="never"
            pullToRefreshEnabled={false}
            textZoom={100}
            setBuiltInZoomControls={false}
            webviewDebuggingEnabled
          />
        </View>
      ) : null}
      {failure ? <Offline kind={failure} mode={mode} retrying={retrying} onRetry={retry} /> : null}
      {locked ? <Lock mode={mode} onUnlock={unlock} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  web: { flex: 1, backgroundColor: "transparent" },
});
