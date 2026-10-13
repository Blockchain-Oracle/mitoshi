# Environment matrix (names only; values live in Coolify — see `infra/secrets.md`, `infra/coolify.md`)

| Variable | web (Coolify app) | ops (Coolify app) | Testnet | Mainnet |
|---|---|---|---|---|
| `NETWORK` | ✓ | ✓ | `testnet` | `mainnet` |
| `TEMPO_RPC_HTTP_URL`, `TEMPO_RPC_WS_URL` | ✓ | ✓ | Moderato 42431 | Tempo 4217 |
| `RH_RPC_HTTP_URL` | ✓ | ✓ | Robinhood testnet 46630 | Robinhood 4663 |
| `BASE_SEPOLIA_RPC_HTTP_URL` | ✓ | ✓ | ✓ | — |
| `APP_ORIGIN`, `PASSKEY_RP_ID` | ✓ | — | `https://testnet.mitoshi.xyz`, `mitoshi.xyz` | `https://mitoshi.xyz`, `mitoshi.xyz` |
| `DATABASE_URL` | ✓ | ✓ | Coolify Postgres `mitoshi-testnet-db` (internal URL) | Coolify Postgres (mainnet) |
| `REDIS_URL` | ✓ | ✓ | Coolify Redis `mitoshi-testnet-redis` (internal URL) | Coolify Redis (mainnet) |
| `RELAY_FEE_PAYER_PRIVATE_KEY` | ✓ | — | ✓ | ✓ |
| `OPS_INTERNAL_TOKEN`, `STREAM_TICKET_SECRET` | ✓ | ✓ | ✓ | ✓ |
| `SOCIAL_SESSION_SECRET`, `ROOM_TOKEN_SECRET` | ✓ | ✓ | ✓ | ✓ |
| `REDSTONE_GATEWAYS` (secret; D-210) — JSON `[{url, apiKey}]`, RedStone's authenticated gateways; without it the public pair (switched off 2026-10-29) | ✓ | ✓ | ✓ | ✓ |
| `<ROLE>_PRIVATE_KEY` (roller, relay, settler, maker, keeper, …) | — | ✓ | ✓ | ✓ |
| `DRY_RUN`, `OPS_ACTORS`, `OPS_HTTP_PORT=8080`, `OPS_STUCK_PASS_MS` | — | ✓ | ✓ | ✓ |
| `MPP_PAYER_PRIVATE_KEY`, `MPP_ROOT_ADDRESS` | — | ✓ | ✓ (roles `mpp-payer` / `mpp-root`, Moderato pathUSD, D-085) | after Q-020 |
| `MPP_MAINNET_APPROVED`, `MPP_MAX_PER_REQUEST_BASE`, `MPP_MAX_PER_DAY_BASE` | — | ✓ | caps optional | `MPP_MAINNET_APPROVED=1` only with the owner's go (Q-020) |
| `THEME_KEYS_SECRET` (64 hex; `theme-agent`) | — | ✓ | ✓ (2026-10-13) | KMS-wrapped |
| `LAUNCH_KEEPER_PRIVATE_KEY` (`launch-keeper`; else `KEEPER_PRIVATE_KEY`) | — | ✓ | unset: the `keeper` key | ✓ |
| AI provider keys: `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` (either one switches the brain on; Claude first when both), or `AI_GATEWAY_API_KEY`, or `AI_BASE_URL` + `AI_API_KEY`; `AI_MODEL` names another model (D-221) | ✓ (Sensei; `SENSEI_MODEL`, `SENSEI_VIA`) | ✓ (agents; `AGENT_VIA`, `AGENT_MAX_CALLS_PER_HOUR`, `AGENT_TIMEOUT_MS`) | ✓ (2026-10-11: `OPENAI_API_KEY` → `openai/gpt-6-sol`) | ✓ |
| `DATASTREAMS_API_KEY`, `DATASTREAMS_API_SECRET` | ✓ | ✓ | after Q-011 | ✓ |
| `FINNHUB_API_KEY`, `ALPACA_*`, `TEMPO_INDEXER_API_KEY` | ✓ | ✓ | ✓ | ✓ |
| `TIDX_URL`, `TIDX_BASIC_AUTH` (self-hosted tidx), `INDEXER_VIA_MPP` | — | ✓ | optional (D-086) | optional; MPP after Q-020 |
| `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `FCM_SERVICE_ACCOUNT` | — | ✓ | SM2 | — |
| `WALLETCONNECT_PROJECT_ID` | ✓ | — | ✓ | ✓ |
| `X_OAUTH2_CLIENT_ID`, `X_OAUTH2_CLIENT_SECRET`, `X_SESSION_SECRET`, `X_REDIRECT_URI` (S11) | ✓ | — | app "mitoshi-testnet"; `https://testnet.mitoshi.xyz/api/x/callback` | its own X app; `https://mitoshi.xyz/api/x/callback` |
| `NEXT_PUBLIC_X_HANDLE` (S11; the bot a mention addresses) | ✓ (build-time) | — | `Mitoshi_app` | the mainnet bot |
| `X_HANDLE`, `X_RETTIWT_API_KEY`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET` (S11) | — | ✓ | `Mitoshi_app` | the mainnet bot |
| `X_API_KEY`, `X_API_KEY_SECRET` (S11; the OAuth 1.0a consumer pair) | ✓ | ✓ | ✓ | ✓ |
| `X_BEARER_TOKEN` (S11; app-only reads, the relay's last way in) | — | ✓ | ✓ (402 until credits) | ✓ |
| `X_EXECUTOR_PRIVATE_KEY` (S11; else the `x-relay` role key), `X_RELAY_LIVE=1` (signs; with `DRY_RUN=0`), `X_POSTING_ENABLED=1` (receipt replies, live only), `X_REPLY_IMAGES_ENABLED` (the receipt card with each reply; on unless `0`), `X_POLL_MS` (default 20 s) | — | ✓ (`OPS_ACTORS` gains `x-relay`) | ✓ | ✓ |
| `CWF_REGION_OVERRIDE`, `DEV_FIXTURES` | ✓ | — | optional | never |
