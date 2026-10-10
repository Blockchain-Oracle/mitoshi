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
3. Rooms (ticker + Window): visitors read; posting gated on a real engine position; optimistic, draft kept on failure.
4. Takes + cashtags + reactions + Tail/Fade; the composer bound to the card on screen; rooms/takes on the stream.
5. Profiles: editing, follows, the drawer's profile header; `/u` shows takes and follows.
6. `/activity` + the LifecycleWatcher + the rail's badge (the notification centre under Portfolio).
7. Alerts (basis + staleness gate) + `/settings/notifications`; push delivery lands with SM2.
8. Sensei: the brain (MPP or a direct key), streamed tokens, AI data-sharing consent first.
9. Reels.
10. `/settings/account` completion (backup passkey, key-used history, AI consent, export, deletion, 5 s Undo),
    `/contact` (21st 25081), privacy/terms updated for social and AI data.
11. The weekly season league (D-195) in the account drawer.
12. The gate.
