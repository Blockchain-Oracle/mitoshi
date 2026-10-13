# Mitoshi round 6 (2026-10-13) — the owner's live review: liveness, honesty, docs, download, agents, revamp

## Context
The owner used the live app (screenshot: SOL terminal, UP/DOWN disabled under "Waiting for the opening print") and
listed what is broken or confusing. Round 5's design revamp (D-229: landing to premium 21st.dev components with
Refero references, themes, every state, every mediocre component) had not started, because a network outage killed
its agents. It runs in this round. The domain moved to mitoshi.xyz (D-228). Decision D-230.

## The owner's points → what we do
1. **"Waiting for the opening print", with no countdown.** UP/DOWN sit disabled and nothing says until when.
   - Show the Window's open time and a live countdown.
   - Say why in plain words: the price network hasn't delivered the opening print yet.
   - Root cause: RedStone's public gateways refuse requests in growing daily windows (D-210). Prints stall, so Windows
     can't open. Wire every gateway the code supports, make ops retry and fall back, and land the authenticated key
     as soon as it arrives.
2. **"No liquidity at this size — nobody is on the other side of this book."** A user must be able to trade.
   - The house maker quotes every listed Window on both sides, with depth for the default sizes.
   - When the book is thin, offer the size that fills instead of a dead end.
   - Find why quoting stopped (the stalled prints from point 1, capital, or the quoter's limits) and fix it on
     testnet.
3. **"Getting a price…" takes too long** before a position opens. Measure it, find the slow step, fix it.
4. **The `pricing…` tab** in the cadence chips reads like a bug. Show a proper label or a skeleton chip.
5. **Themes load slowly,** and "Reading the theme…" is a poor loading state. Make it fast (server-render and cache
   the reads), and use a skeleton shaped like the page.
6. **Bridge and reserves exist but can't bridge yet.** The Robinhood side waits on test ETH.
   - Get the test ETH (Codex), deploy and connect the Robinhood leg, and prove a bridge in and out.
   - Until then, the pages say exactly what works now and what is waiting, in one line, with no dead buttons.
7. **Docs belong on their own domain.** The in-app `/docs` section goes. `/docs` and every docs link point to
   https://docs.mitoshi.xyz.
8. **Download.** The home page and the navigation point to `/download`. That page lists the iOS app (TestFlight
   link), the Android app (Play testing link) and the web app.
   - Ship both stores: TestFlight (internal plus a public link) and Play (internal, then open testing).
9. **Agents.**
   - An agent shows "14 copies · 0 decisions". Count and show its real decisions.
   - The cockpit shows "0:00 · Due now" with "Heartbeat 47s ago". Show a real countdown to the next decision and
     the last decision's time and result.
   - Raw ops text ("scanned 1 Window, closest trigger 3 bps away; 1 live subscriber") becomes human copy.
   - Check /agents/2 first.
10. **Round 5 revamp:** the landing page in premium 21st.dev components with Refero references, themes, every
    state, every mediocre component. The owner said "I can't mention them all — you know what mediocre is".
11. **Full QA by Codex in the owner's Zen browser with the connected wallet.** Codex logs every bug it finds, and the
    builders fix them.
12. **The demo video script,** in the owner's walkthrough style, verified against the live app, so the owner can
    record.

## How it runs
Fix packages for points 1–9 run in worktrees, alongside the round-5 audit, research and builds. One integrator
merges them all on `integration/t1`, with a visual polish pass at 375 and 1440. There is one web/ops deploy under the
shared lock, then a live check on https://mitoshi.xyz. Codex's QA findings land in `docs/qa/` and become fix items.
