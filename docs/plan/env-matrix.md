# Environment matrix (names only; values live in the hosts' secret stores — see `infra/secrets.md`)

| Variable | web (Vercel) | ops (Fly) | Testnet | Mainnet |
|---|---|---|---|---|
| `NETWORK` | ✓ | ✓ | `testnet` | `mainnet` |
| `TEMPO_RPC_HTTP_URL`, `TEMPO_RPC_WS_URL` | ✓ | ✓ | Moderato 42431 | Tempo 4217 |
| `RH_RPC_HTTP_URL` | ✓ | ✓ | Robinhood testnet 46630 | Robinhood 4663 |
| `BASE_SEPOLIA_RPC_HTTP_URL` | ✓ | ✓ | ✓ | — |
| `APP_ORIGIN`, `PASSKEY_RP_ID` | ✓ | — | `https://testnet.<domain>`, `<domain>` | `https://<domain>`, `<domain>` |
| `DATABASE_URL` | pooled | direct | Neon testnet | Neon mainnet |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | ✓ | — | shared Upstash, per-network prefixes | same |
| `RELAY_FEE_PAYER_PRIVATE_KEY` | ✓ | — | ✓ | ✓ |
| `OPS_INTERNAL_TOKEN`, `STREAM_TICKET_SECRET` | ✓ | ✓ | ✓ | ✓ |
| `SOCIAL_SESSION_SECRET`, `ROOM_TOKEN_SECRET` | ✓ | ✓ | ✓ | ✓ |
| `<ROLE>_PRIVATE_KEY` (roller, relay, settler, maker, keeper, …) | — | ✓ | ✓ | ✓ |
| `DRY_RUN`, `OPS_ACTORS`, `OPS_HTTP_PORT=8080`, `OPS_STUCK_PASS_MS` | — | ✓ | ✓ | ✓ |
| `MPP_PAYER_PRIVATE_KEY`, `MPP_ROOT_ADDRESS` | — | ✓ | — | after Q-020 |
| `THEME_KEY_KEK` | — | ✓ | ✓ | KMS-wrapped |
| AI provider keys | ✓ | ✓ | ✓ | ✓ |
| `DATASTREAMS_API_KEY`, `DATASTREAMS_API_SECRET` | ✓ | ✓ | after Q-011 | ✓ |
| `FINNHUB_API_KEY`, `ALPACA_*`, `TEMPO_INDEXER_API_KEY` | ✓ | ✓ | ✓ | ✓ |
| `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `FCM_SERVICE_ACCOUNT` | — | ✓ | SM2 | — |
| `WALLETCONNECT_PROJECT_ID` | ✓ | — | ✓ | ✓ |
| `CWF_REGION_OVERRIDE`, `DEV_FIXTURES` | ✓ | — | optional | never |
