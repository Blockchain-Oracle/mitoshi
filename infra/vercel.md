# Vercel (plan C.6)

Two projects from this repo, root `web/`: **testnet** (`testnet.<domain>` → Moderato) and **mainnet** (`<domain>` →
Tempo). Region iad1. Previews use their own hostname as the passkey rpId. Env per `env/web.<network>.example`. The apex
must serve `/.well-known/*` without redirecting to `www` (passkeys and the app's associated domains, SM1).
Speed Insights on both. Lighthouse CI runs on `vercel.deployment.success` (S1).
