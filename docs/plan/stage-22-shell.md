# S22 — The shell: roy-chain/Slush structure, Mitoshi identity (after R.0; D-189, D-190, D-198)

On `integration/t1` (D-201). Sources: Baku/roy-chain `ede3ed38` (`apps/web/src/components/shell/*`, `constants/nav.ts`,
`components/ui/{dialog,drawer}.tsx`, `styles/tokens.css`), the Slush study (`docs/build/research/inspo/slush/`), Owarine
`ecb7565b` (`web/src/lib/sound/*`, `web/src/lib/haptics.ts`). Ledger rows RV-01…RV-16 in `revamp-parity.md`.

- [x] 22.1 Tokens: a `layout` group in `packages/tokens/src/tokens.json` (rail 248 / compact 88, inset 16, nav-h 48,
  nav gap 12, stage edge 2, drawer 384 / wide 560 / inset 16, dock height, modal max) emitted by `staticTheme`; radius
  is the existing `radius.xl` (24); rail, stage, drawer and scrim colours as `SEMANTIC` aliases of existing surfaces (no
  new keys in palette/surfaces/shared/type/radius — `tokens.test.ts` pins them to Masayume); motion durations (hover
  120, drawer 380 in / 240 out). `pnpm --filter @cwf/tokens gen`, `pnpm tokens:check`.
- [x] 22.2 Rail, top line, stage, dock: port roy-chain `app-shell.tsx`, `rail.client.tsx`, `mobile-dock.client.tsx`,
  `top-line.tsx`, `help-menu.client.tsx` into `web/src/components/shell/` — lucide icons, `layout` tokens, the active
  pill moved by a CSS transform (no motion in the shell's first-load JS), pathname read inside Suspense (S1 F-S1 finding),
  keys 1–6, the Testnet pill, compaction at height ≤ 880, the account menu and the money pill with the privacy eye at
  the rail foot, the AllowancePill and banners in the top line. Rewrite `header/nav-items.ts` as `RAIL_NAV`, `DOCK_NAV`,
  `EVERYTHING_SECTIONS` and `nav-items.test.ts` (38 navigable paths, one home each; `/trade` included; `isTopLevel`
  treats `/trade/*` as top level).
- [x] 22.3 Overlays: `components/ui/drawer.tsx` (21st 31360) restyled to the floating geometry; `modal.tsx` (31359);
  `useDrawerParam` (`?d=` read with `useSearchParams` inside Suspense, pushed with `history.pushState`; Back closes;
  focus returns); the Everything drawer (the More panel's groups + search); the shortcuts modal; toasts top-centre,
  `ToastHost limit` 3. (Typed terminal toasts — same-id replace, loading, confetti, and the settle toast's two phases
  `settle-<id>` "paying…" → "paid" from the one owner, `SettledToasts` — arrive with their first user, S23c/d.)
- [x] 22.4 Retire the header, `LiveMarquee`, footer, `MobileBottomNav` and `MorePanel` from `(app)`/`(island)`;
  `IslandChrome` → the dock; `(site)` keeps a slim public header + footer and "Open the app" → `/trade`; the parlay
  `SlipDock` and the ticket slide-over sit above the dock.
- [x] 22.5 Live pages in the stage grammar (page header display · body-lg · source line; filter pills; card grids;
  shape skeletons; empty/error 19745): `/markets`, `/portfolio`, `/settings/account`, `PendingRoute`; then `/parlay`,
  `/surface`, `/games/range`, `/games/moonshot` and the private desk after the S10 browser gate.
- [x] 22.6 Feedback engine: port Owarine `lib/sound/trade.ts` (the six synthesised cues and the synth combo/surge/slump/
  adverse voices only — the UGLYCASH flow clips are not ported, so no audio files ship) and `lib/haptics.ts`; one
  setting `cwf.feedback.v1` (`lib/feedback.ts`); engines loaded on idle; "Sound & Vibration" in `/settings/account`;
  tap cue + 8 ms haptic on rail, dock and the Everything links. (`lib/sound/music.ts` arrives with its first user, the
  terminal's music chip, in S23f.)
- [x] 22.7 Register rows in `docs/design/components.md` (rail ← 21517 via Baku, dock ← 15742 via Baku, drawer 31360
  restyled, dialog 31359, toast 24297, Everything, shortcuts modal, feedback engine).
- **Gate:** UX gate at 320/390/768/1023/1024/1279/1280/1440 × both themes (`web/e2e/ux-gate.ts --widths`); axe on every
  drawer and modal; Back closes `?d=` and restores focus; `21st review`; `pnpm perf:budgets` with the shell's delta on
  the largest app route (`/markets` 191.6 KB before); Lighthouse on the S1 list; `shell-interactions` and `visual-snap`
  drivers rewritten; structure screenshots beside roy-chain `.cache/shots/s16d-final/*` and Slush `001`, `010`, `014`.
  **Rows:** RV-01…RV-16, UX-13, UX-14, UX-16 (engine), L-02, L-03, L-04 (re-homed).
  Lighthouse on the shell deploy (run 37779108546, 2026-10-08, host index 2041–2159): LCP 1.2–1.7 s and CLS ≤ 0.035
  on every route; TBT passes on `/` 129 ms, `/proof/[id]` 121 ms, `/status` 126 ms — the shell's own cost — and fails
  where it failed before the shell: `/markets` 794 ms, `/markets/[id]` 1,180 ms, `/portfolio` 300 ms (the Markets hero's
  lightweight-charts island and the portfolio's reads). Those routes' TBT is owned by S23 (the terminal replaces the
  hero; 23j retires its island) and stays open on the S23 gate, not here.

## Findings

- F-S22-01: Next's `history.pushState` integration treats a state that carries its own internal flag as an internal
  push and does not update `useSearchParams`; the drawer param pushes a plain `{ __drawer }` state (Next adds its
  fields), and every opener goes through `openDrawer`.
- F-S22-02: a Suspense boundary around a pathname read leaves React's streamed copy in the DOM (hidden), so an effect
  inside it can register twice; the rail's 1–5 keys are registered once by the rail, outside the boundary.
- F-S22-03: on a ≈ 110 KB/s link a tap on Sign in waited 8–25 s for the ~1 MB wallet runtime with nothing on screen;
  the shell now answers at once ("Getting sign-in ready…") and the runtime opens the modal when it lands.
- F-S22-04 (gate): `e2e/ux-gate.ts` counted a Base UI switch's hidden native input (`aria-hidden`, 1×1, 15 px) as a
  target and an input; it now skips `aria-hidden` controls. 7 routes × 8 widths × 2 themes: 0 findings after the home
  disc grew from 40 to 44 px.

## Handoff
