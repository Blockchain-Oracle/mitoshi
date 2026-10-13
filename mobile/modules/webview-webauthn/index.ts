// Passkeys inside the Android web view (D-227, MOBILE): the JS face of WebviewWebauthnModule.kt. iOS needs no module —
// WKWebView offers passkeys for an rpId listed in the app's webcredentials associated domains (app.config.js).
import { requireOptionalNativeModule } from "expo";

export type WebAuthnSupport = "app" | "unsupported" | "missing" | "refused";

interface WebviewWebauthnModule {
  enable(viewTag: number): Promise<WebAuthnSupport>;
}

const native = requireOptionalNativeModule<WebviewWebauthnModule>("WebviewWebauthn");

/** Turns on WebAuthn for the web view under `viewTag` (Android); null where the module doesn't exist (iOS). */
export async function enableWebViewPasskeys(viewTag: number): Promise<WebAuthnSupport | null> {
  return native ? native.enable(viewTag) : null;
}
