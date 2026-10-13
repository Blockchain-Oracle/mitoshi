// Passkeys inside the Android web view (D-227, MOBILE; docs/specs/mobile.md D.5 spike X14). Android's WebView refuses
// WebAuthn by default (WEB_AUTHENTICATION_SUPPORT_NONE). FOR_APP lets the page run passkey ceremonies as this app: the
// WebView asks Credential Manager, which allows the rpId only if https://<rpId>/.well-known/assetlinks.json lists this
// package and signing key under delegate_permission/common.get_login_creds; clientDataJSON's origin is then
// android:apk-key-hash:<base64url SHA-256 of the signing certificate>, which the server's ceremony handler accepts.
// Source: developer.android.com/identity/sign-in/credential-manager-webview and androidx.webkit 1.14.0 WebSettingsCompat.
package xyz.mitoshi.webviewwebauthn

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WebviewWebauthnModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WebviewWebauthn")

    // `viewTag`: a native view that holds the web view (the shell's wrapper). Answers "app" when passkeys are on,
    // "unsupported" when this device's WebView predates the feature, "missing" when no web view is under the tag yet,
    // and "refused" when the WebView kept its default after the call.
    AsyncFunction("enable") { viewTag: Int ->
      if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_AUTHENTICATION)) return@AsyncFunction "unsupported"
      val root = appContext.findView<View>(viewTag) ?: return@AsyncFunction "missing"
      val web = findWebView(root) ?: return@AsyncFunction "missing"
      WebSettingsCompat.setWebAuthenticationSupport(web.settings, WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP)
      val now = WebSettingsCompat.getWebAuthenticationSupport(web.settings)
      if (now == WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP) "app" else "refused"
    }.runOnQueue(Queues.MAIN)
  }

  private fun findWebView(view: View): WebView? {
    if (view is WebView) return view
    if (view !is ViewGroup) return null
    for (i in 0 until view.childCount) {
      findWebView(view.getChildAt(i))?.let { return it }
    }
    return null
  }
}
