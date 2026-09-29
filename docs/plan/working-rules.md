# Working rules

The Tempo entry to Colosseum's Crypto World's Fair: prediction markets and stocks on Tempo, a source-led port of
Masayume (`sommina-events` @ `68f7a09`) and Agari (`agari-wt/w1`), plus a mobile app. Full rules: `00-plan.md` §4.

## Read order (every session, before editing)

1. This file.
2. `STATUS.md` — the single resume pointer. **Never trust memory over STATUS.md.**
3. The current stage file `stage-*.md`: first unchecked box, then `## Handoff`.
4. The last 10 D-entries and all open Q-entries in `decisions.md`.
5. Only the `00-plan.md` sections and `docs/specs/*` sections the stage names.
6. `git status && git log --oneline -5`; confirm HEAD matches STATUS; run the fast gate.

## Rules (summary of plan §4)

- **Scope:** the deadline is never a reason. Never cut, hide, defer or thin a feature; never pull a page from the nav.
  Sequencing is fine. Real integrations only — disclaimers, never mocks or paper backing.
- **UX first:** every UI step starts from its 21st.dev pick (`docs/specs/ux.md` E.1/E.4), revamps it per D-044, passes
  the UX gate (plan §2.5) and is recorded in `docs/design/components.md`. Owner overlay rule: centred modals and the
  right-edge slide-over; no bottom sheets.
- **Libraries:** read each library's docs (Context7 first; vendor docs when Context7 is unavailable) before coding
  against it; cite them in the step. See `docs/libraries.md`.
- **Performance:** budgets in plan §3.1 are CI gates.
- **Tests:** not a deliverable; write the tests that prove the step's functionality; never count them.
- **Package manager:** pnpm only. **Files:** ≤ 400 lines. **Money:** integer base units, no floats.
- **Boundaries:** only `packages/markets` does chain I/O; `packages/core` stays pure.
- **No tool config in the repo:** no `CLAUDE.md`/`AGENTS.md` anywhere (Next 16.3 needs `agentRules: false`); `.21st/`,
  `.claude/`, `.agents/` are gitignored.
- **Secrets:** never printed or committed; names and locations only in `infra/secrets.md`.
- **Contracts:** Foundry ≥ 1.8.3, `network = "tempo"`; pay `msg.sender` only; receive-policy pre-check on every payout;
  no `payable`; no CREATE in any flow an access key signs.
- **Provenance:** ported files carry `Ported from Masayume 68f7a09:<path>` or `Agari <sha>:<path>`; adopted 21st
  components carry `From 21st.dev <id> <author/slug>`.
- **Commits:** one per step, `<type>(S<n>.<step>/<area>): <summary>`, trailers `Stage:` and `Parity:`; tick the stage box
  in the same commit; never end a session dirty.
- **Evidence:** every on-chain tx goes into `acceptance/S<n>.md` after `cast receipt`; parity rows advance only at gates;
  every live mainnet action needs the owner's go.

## Gates

- **Fast:** `pnpm typecheck && pnpm invariants && pnpm codegen:check`
- **Web:** `pnpm build` (+ route budgets from S1)
- **Contracts:** `forge build --sizes` in both profiles (`FOUNDRY_PROFILE=evm` for the Robinhood/transit side)
