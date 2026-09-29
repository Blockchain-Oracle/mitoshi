# S16 — Themes (16c after S15a + money gate; 16a after 16c, S15, S3.5, S9; 16c.4 deploy after S15b–c) (M3; App. B.4)

- [x] 16c.1 Spike X4 → D-entry: one tx or split (`setAllowedCalls` chunks ≤ 5 targets).
- [ ] 16c.2 `src/themes/ThemeRegistry.sol` + tests. 16c.3 `src/themes/ThemeRouter.sol` + tests +
  `invariant_routerHoldsOnlyOwedFees` + a test that settlement calls `sync` before each transfer. 16c.4 deploy;
  `relay/policies/themes.ts`.
- [ ] 16a `packages/core/src/themes/{spec,drift,plan}.ts` (JCS hash; UI-amount drift; planner); `packages/markets/src/
  themes/*`; `/api/themes/[id]/agent-key` → ops `/internal/theme-keys` (keys never touch Vercel); `theme_agent_keys`;
  theme-agent/rebalancer actor (B.4.4); ERC-8004 registration; MPP receipts.
- [ ] Web: `/themes` catalogue (Q-004) as a scrollable card deck (21st 8414 card, NAV sparkline 30538, realized vs
  on-paper, holdings chips, agent badge, followers); `/themes/[slug]` (NAV = reference × m; allocation 20086 donut +
  26545 partition bar; a rebalance timeline with the agent's decision, MPP receipt and "key used" receipt; "Next
  rebalance in…" / "Paused: market closed"; cap-refusal and failed-rebalance states); follow modal in the arm grammar
  (one sentence, one button, caps behind "adjust", "What you are signing" disclosure; centred, 26652 alert-dialog base;
  1–2 prompts); unfollow = one confirm with "your holdings stay in your wallet", a 5 s Undo, and a separate "sell everything"
  action; a first-use explainer on the first follow;
  `/themes/create` wizard 23576; one strategy browser with distinct badges and verbs (Copy vs Follow); idle-cash label.
- **Gate:** a follower follows on Moderato; the agent rebalances from the follower's account with no prompt; the MPP
  receipt linked by `decisionId`; an over-cap trade reverts; after `revokeKey` the next rebalance fails; tag
  `m3-themes`; route budget on `/themes`. **Rows:** TH-01…TH-13, N-03, N-04.

## Findings

_None yet._

## Handoff

_Not started._
