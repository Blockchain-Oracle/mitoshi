# Secrets — names and where they live (never values)

| Name | Where | Used by |
|---|---|---|
| `RELAY_FEE_PAYER_PRIVATE_KEY` | Vercel (per network) | `/api/relay` fee payer |
| `<ROLE>_PRIVATE_KEY` (roller, price-relay, settler, seed-maker, earn-quoter, keeper, x-relay, desk, stock-sync, ops-fee-payer) | Fly secrets (per network); locally `~/.config/cwf/<network>/<role>.json` | ops actors |
| `DEPLOYER` key | local `~/.config/cwf/<network>/deployer.json`; mainnet via the owner's hardware wallet / Safe | forge scripts |
| `MPP_PAYER_PRIVATE_KEY`, `MPP_ROOT_ADDRESS` | Fly (mainnet, after Q-020) | brain via MPP |
| `THEME_KEY_KEK` | Fly (testnet); KMS on mainnet | theme agent keys |
| `OPS_INTERNAL_TOKEN`, `STREAM_TICKET_SECRET`, `ROOM_TOKEN_SECRET`, `SOCIAL_SESSION_SECRET` | Vercel + Fly | internal auth, stream tickets, rooms, social session |
| `DATABASE_URL` (pooled for web, direct for ops) | Vercel + Fly | Neon Postgres per network |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Vercel | Upstash (passkey challenges, sessions) |
| AI provider keys | Vercel + Fly | Sensei, agents |
| X OAuth + rettiwt cookies | Fly | x-relay |
| `FINNHUB_API_KEY`, `ALPACA_*`, `DATASTREAMS_API_KEY/SECRET`, `TEMPO_INDEXER_API_KEY` | Vercel + Fly | data providers |
| RPC provider URLs (`TEMPO_RPC_*`, `RH_RPC_HTTP_URL`, `BASE_SEPOLIA_RPC_HTTP_URL`) | Vercel + Fly + GitHub Actions | chain reads |
| APNs `.p8` + key ID + team ID, FCM service account | Fly | notifier (SM2) |
| Reown project ID | Vercel | WalletConnect |
| EAS token, Android upload keystore (EAS-managed) | GitHub Actions / EAS | mobile builds |
| `FLY_API_TOKEN` | GitHub Actions | deploy-ops |

Rules: never print or commit a value; `redact()` in ops scrubs known secrets from logs; keys are 0600 files locally.
