# SM4 — Native hot paths and system surfaces (after SM3 + S4 + S7; stock/theme/launch/bridge rows after S15/S16/S17/S14)

> **Revamp (2026-10-08, D-189…D-200):** the native call flow follows the S23 terminal (UP/DOWN ↔ TRAIL/CLOSE, live value, the haptic kinds in D.3).

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

## Findings

_None yet._

## Handoff

_Not started._
