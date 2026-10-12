# Owner actions (dated; the owner does these, the agent drafts where it can)

| Needed by | Action | Status |
|---|---|---|
| S0 | ~~Private GitHub repo~~ done 2026-09-29 (`Blockchain-Oracle/mitoshi`, default `integration/t1`) | Done |
| S0 | ~~Buy `mitoshi.xyz` + DNS~~ done 2026-09-29 (agent, via API): order 215369793, $2.20; A `@`, `www`, `testnet`, `*.testnet`, `ops`, `stream` → 84.46.247.92 | Done |
| S0 | ~~Namecheap API whitelist~~ done (owner) | Done |
| S0 | ~~Push-to-deploy route~~ decided (owner): deploy with the Coolify CLI, as Agari does | Done |
| S0 gate | ~~Domain + hosting accounts~~ decided: Mitoshi / `mitoshi.xyz` (D-060), Coolify (D-061) | Done |
| S0 (X11) | Start daily Robinhood Chain testnet faucet claims (5 × 5 tokens / 24 h) | Open |
| Before S3.5 | Approve and fund the capped mainnet MPP wallet (Q-020) | Open |
| S1, S4 (NYSE date), S15, S16, R4-0 | Passkey checks on your own device. R4-0 (2026-10-12): sign in with a passkey on a 375 × 667 phone, open /trade/BTC and check the account reads "Passkey" and the full one-tap card leaves the settings stack clear of the chart controls (agents can only sign in with a browser-wallet test session) | Open |
| S1 gate (geofence) | Put a country header in front of Coolify for the live domains: proxy `mitoshi.xyz` (and the testnet host) through Cloudflare so requests carry `cf-ipcountry`. Coolify stamps none; without it the geofence answers "open" everywhere (Q-008 not enforced live) | Open |
| Before S11 | X account for trade-from-X | Open |
| S14c day 1 | Send the LayerZero direct-pathway request — draft ready in `stage-14-bridge.md` §14c.13 A | Open |
| Before S19 | Chainlink Data Streams subscription + testnet credentials (Q-011); eligibility/budget for mainnet Stock Tokens (Q-008); Safes (Q-016) | Open |
| After S0.11 | Retire the laptop RedStone archiver once the overlap check passes | Open |
| Weekly | Weekly update video | Open |
| SM1 | Expo account (EAS); App Store Connect app record for the testnet bundle; latest agreements accepted; internal TestFlight group; `eas device:create` for your iPhone | Open |
| S14c | Test ETH: deployer `0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e` ~0.05 on Robinhood testnet (46630) and ~0.05 on Base Sepolia (84532); stock-sync `0x51476Dd5CaEb8BEE9585050A9152dea729fC8610` ~0.02 on Robinhood testnet | Open |
| SM2 | APNs auth key `.p8`; Firebase project + FCM service account + `google-services.json`; Reown (WalletConnect) project ID; an Android phone | Open |
| SM5 | App Privacy, age-rating and export-compliance answers approved; ask Colosseum whether judges install apps (Q-030) | Open |
| S23a | A dedicated Alpaca market-data key for Mitoshi ops (today's `ALPACA_*` is shared with Agari, and the free plan allows one data WebSocket per key); until then stock display ticks use REST polling | Open |
| S23 gate | The terminal run on your own phone: tutorial → sign-up → UP → PnL on the line → Trail → CLOSE → settle | Open |
| **Now — before 2026-10-29** (D-210) | RedStone's public gateways are being switched off: since 2026-10-08 they refuse requests in daily windows that grow until **2026-10-29**, then stop. Request an API key and authenticated gateway URL (two pairs) with RedStone's form: https://docs.google.com/forms/d/e/1FAIpQLSd1FyV0TLXjRtpor8_LbhdrdYimmgMrb_cK0FZ1xc8EGceIPg/viewform. Then set `REDSTONE_GATEWAYS` (secret, JSON `[{"url":"…","apiKey":"…"},{…}]`) on both Coolify apps, ops and web, and redeploy. Until then settlement prints, the house's quotes, halt-watch, Boost knock-outs and the exit keeper stall inside each window | Open |
| S13 step 8 (Sensei) | ~~A model credential on the testnet web app~~ done 2026-10-12 (owner: "use the OpenAI key too"): `OPENAI_API_KEY` — the owner's key Agari runs on, copied app to app on Coolify, runtime-only, never shown. Any one key now switches Sensei on (D-221); it answers on `openai/gpt-6-sol`. Mainnet can still pay per question by MPP (`SENSEI_VIA=mpp`) after Q-020 | Done |
| Now (F-S13-04) | The Coolify box filled its disk with kept images (a failed deploy, 2026-10-10). Lower the number of images Coolify keeps for rollback on the Mitoshi web and ops apps, and turn on the server's scheduled Docker cleanup; the box also hosts other projects' images | Open |
| S9 (house agent #3) | ~~The same model credential on the testnet **ops** app~~ done 2026-10-12: the same `OPENAI_API_KEY` (runtime-only); the runner boots "agent brain: openai/gpt-6-sol via direct" and reads each BTC 5m Window (D-221); testnet reads are unpaid (D-218.4) | Done |
| S9 (agent rater) | Release the ERC-8004 rater when you are happy with its dry lines: set `AGENT_RATER_LIVE=1` on the testnet ops app (it then rates each house agent once per completed UTC day, D-218.6). Cadence default one pass a day (`AGENT_RATER_EVERY_SEC`) | Open |
