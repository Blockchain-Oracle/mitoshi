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

_Not started._
