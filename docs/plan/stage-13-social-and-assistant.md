# S13 — Social and assistant (after S4, S3.5)

> **Revamp (2026-10-08, D-189…D-200):** adds the season league (D-195, Tradash's Aura) shown in the terminal's account drawer, profile editing for the drawer's profile header, and the activity badge on the rail.

- [ ] Sensei (brain + optional MPP, streamed tokens; stock holdings line lands in S15e), Room + ticker rooms (position
  gate), takes + cashtags, alerts (basis + staleness gate; delivered by push in the app), reels, `/u/[address]`,
  `/api/social/*`, `/activity` + LifecycleWatcher (filed under Portfolio as the notification centre with a header
  badge), subscription coordinator. UX (fix 10): one app session for joins, follows and takes (passkey session or key,
  not three sign-ins + a signature per take); visitors read rooms, only posting is gated; optimistic posting that keeps
  the draft on failure; reactions; Tail and Fade on takes; the take composer bound to the current card; rooms/takes on the D40 stream. 21st
  starts: chat 26900, takes 2652 + context menu 23646, reels 23559/23568, profile 781, activity 28490, assistant dock
  31661 + 12399.
- [ ] D34 on the web (the app inherits it): report / block / filter on rooms, takes, profiles, agent and token pages
  (`social_reports`, `social_blocks`, word filter, moderation queue in ops), published contact; AI data-sharing consent
  before the first Sensei or agent call (which provider receives what); `/settings/account` deletion of off-chain data
  (profile, takes, room memberships, push devices, X binding, KV session records) with the on-chain disclosure.
- [ ] `/settings/account` completion (D44): backup-passkey prompt, "key used" history, linked wallets, AI consent,
  export, deletion, region posture; `/privacy`, `/terms`, `/contact` (21st 25081 form); `/settings/notifications` (topics grouped Money moved / Social / Games; money on by default); 5 s Undo before
  non-urgent revokes (D43).
  21st starts: form 25081, fields 26523, dialog 31359 (Base UI) + 28339 reasons for report/block.
- **Gate:** one session covers join, follow and take; a room gated on a real engine position; an optimistic post that
  fails keeps its draft; a report reaches the queue; a
  blocked user disappears from the reporter's feeds; deletion removes every off-chain row. **Rows:** L-41…L-45, A-3a,
  A-3c, M-11, MOB-14 (web part), UX-07, UX-09.

## Findings

_None yet._

## Handoff

Started 2026-10-10. Surveyed: the trunk has groundwork only (`packages/brain` with MPP routing and no callers;
`social/0001-0002` tables `room_comments`, `bettors`, `takes`, `take_tags` with no readers; `rooms`/`takes` already on
the stream's allow-list; `server/session.ts` reads `cwf_social` but nothing issues it; orphaned room/take/reel/alert CSS;
`UNDO_WINDOW_MS` unused). References: Agari 03b30ab for Sensei, rooms, takes, alerts, reels, activity, follows (pin
only); Masayume 68f7a09 for the EVM signature check; Owarine/Tradash for the league view (Aura is display-only there).
None has: one session for all social writes, visitor-readable rooms, reactions, Tail/Fade, moderation, AI consent,
streaming, profile editing, export/deletion, a trading-points league — built here. Steps, in order:
1. **Done:** the one social session — a passkey session counts; any other wallet signs once → `cwf_social` (30 days).
2. **Done:** `social/0003` (profiles, reactions, reports, blocks, hidden rows; takes/messages record `via`, not a
   signature; follows on `game_follows`), the stores (`social-people`, `social-posts`, `social-moderation`, Postgres-tested),
   the word filter (obscenity 0.4.6: originals kept, matches starred on read), the ops `moderation` actor (the queue in
   `/health`) and `scripts/ops/moderate.ts` (list · hide · dismiss).
3. **Done (deploy + live check next):** rooms — `/api/social/rooms/<$TSLA | market id>` (anyone reads; posting needs
   the session and a call there: `hasCalled` over fills, Trading Balance executions and seats; 1 post / 3 s, 20 / 10 min),
   reactions, report (21st 31359 + 28339 reasons) and block; live through Postgres NOTIFY → ops `social` relay → the
   stream's `rooms` topic; the terminal's Room drawer (21st 26900's rows, chips and optimistic states; the draft is
   kept on failure) from a chat button beside the chart controls.
4. **Done (deploy + live check next):** takes — `/api/social/takes` (public feed by ticker / authors / following;
   posting on an open Window, facts and line from the index, "backed" from the room gate's read, 3/min and 30/day),
   cashtags in core, reactions, report and block on takes, Tail / Fade (the terminal on that Window with `?pick=` the
   same or the other side highlighted; nothing trades from the feed), the composer bound to the Window on screen; the
   stream's `takes` topic. In the Room drawer as "Takes".
5. **Done (live check with 3–4):** profiles — `/api/social/profile` (read anyone's; edit your own: a 3–20 name, unique
   without case, refused if the filter would star it; a 160-character bio starred on read) and `/api/social/follow`;
   `/u` renders the public name and a social island (bio, followers · following, Follow, report, block, their takes);
   the account drawer's header shows the name with "Edit profile" in place.
6. **Done (live check next):** the notification centre — `/api/notifications?wallet=` (fills from `readWalletFills`,
   settlements from `readSettledRounds`, new followers, takes by people followed; seven days), `/activity` grouped by
   day, the LifecycleWatcher in the app shell (polls every 15 s while visible; says settlements, voids, followers and
   takes — fills stay the terminal's), the unread badge on the rail's Portfolio place; the stale pending entries for
   `/activity`, `/privacy` and `/terms` removed.
7. **Done (live check next):** price alerts — Agari's store (above/below, In NYSE hours or Any hour for stocks) on
   this device, the terminal's bell opening the alerts drawer, the `AlertsWatcher` in the app shell (fires once on a
   fresh tick ≤ 60 s; a Regular rule only in session and not halted; a toast, plus a browser notification when the
   topic allows); `/settings/notifications` (browser permission; Money moved on by default, Price alerts, Social, Games;
   every alert with a remove) and the LifecycleWatcher reading those topics. `/u` back under its budget (338.7 → 211.6
   KB: `networkLine` moved out of the zod module, the report dialog lazy). Push delivery lands with SM2.
8. **Done (live once a model key is set — owner action):** Sensei — `/api/sensei` on the shared brain (`@cwf/brain`;
   default `anthropic/claude-opus-5-5`, effort low, adaptive thinking, Anthropic's server-side refusal fallback on the
   direct route; `SENSEI_VIA=mpp` pays each question through the MPP payer with an `mpp_receipts` row per question),
   streamed as NDJSON token by token; Agari's voice, THE BRAKE and the advice tripwire with every fact rewritten for
   Mitoshi (one book per Window, signed RedStone close, void at 50 cents, Close, Boost, the network's money); the
   consent before the first question, naming the provider from the server's configuration and enforced by the route
   (per provider and version); the terminal's drawer (21st 31661 thread + 12399 composer) reading the Window on screen,
   its book, the session, positions with what Close pays, the settled record and the next report; rate gate 3 s /
   30 per 10 min / 600 an hour. The chart controls wrap upward under ~360 px. `useBookDepth`/`useStakeQuote`/
   `useExitQuote` no longer throw for a null market (F-S13-03).
9. Reels.
10. `/settings/account` completion (backup passkey, key-used history, AI consent, export, deletion, 5 s Undo),
    `/contact` (21st 25081), privacy/terms updated for social and AI data.
11. The weekly season league (D-195) in the account drawer.
12. The gate.
