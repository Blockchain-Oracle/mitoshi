# SM3 — Native account, phase B (after SM1 + S7; spikes X15–X17)

- [ ] SM3.1 X17: accounts SDK + viem on Expo 57 (`pnpm.peerDependencyRules.allowedVersions` for the `^55` peers;
  `react-native-get-random-values`, `MessageEvent` shim; subpath imports only — Metro doesn't tree-shake).
- [ ] SM3.2 `mobile/modules/hardware-keys` (Swift CryptoKit `SecureEnclave.P256.Signing`; Kotlin AndroidKeyStore EC
  P-256, StrongBox with TEE fallback; no biometric prompt per signature) + `src/account/keystore.ts` (DER → (r,s), low-s,
  `prehash: true`, viem `Account.from` custom signer, SDK `Keystore` interface); X15 on Moderato.
- [ ] SM3.3 Native passkeys: `react-native-passkey` + `src/account/passkey-adapter.ts` against our `/api/auth`
  (the SDK's `webAuthn()` doesn't pass `createFn/getFn`); X16 same address; `Provider.create({ adapter, accessKey: {
  keystores: { p256 } }, storage: secureMmkv })`.
- [ ] SM3.4 Injected provider: `src/account/inject.ts` (EIP-1193 over the bridge + EIP-6963 announce, rdns = bundle ID)
  + web connector `web/src/providers/wallet/connectors/shell-device.ts` (full Tempo caps; first row of the picker in the
  shell); native centred confirmation modal for root-signed sends (`presentation: 'transparentModal'`, fade; never
  `formSheet`), reproducing the web arm-modal grammar; MMKV `IntentStore`.
- [ ] SM3.5 Tap trading on hardware keys: the EventVault SESSION grant (S7 flow) goes to the hardware-key account; the
  phase-A browser session grant is revoked on upgrade; a TIP-1011 access key on the root from the same keystore signs
  routine sponsored actions under its limits.
- [ ] SM3.6 Tempo Wallet in the app via `accounts/mobileWebAuth` + `tempoWallet()` (our
  `web/public/.well-known/urpc/consumer.json` lists redirect `<bundle>:/auth`), announced as a second injected provider.
- **Gate:** on both phones: native passkey sign-in → the web address; deposit + grant to the hardware key (self-paid),
  ten sponsored taps with no prompt, a cap refusal, revoke → the next tap fails; Tempo Wallet connects and signs one tx.
  **Rows:** MOB-08, MOB-09.

## Findings

_None yet._

## Handoff

_Not started._
