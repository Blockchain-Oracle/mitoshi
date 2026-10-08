# Design system — the source for every UI step (plan §2, Appendix E)

Masayume's identity is kept (owner answer D-009, narrowed by D-189): the Yosuku-derived palette and faces. Since the
2026-10-08 revamp the **layout** follows roy-chain/Slush (rail, stage, drawers — §Layout below) and the **Markets
screen** follows tradash.xyz's terminal (`docs/plan/revamp-parity.md`). New surfaces are built from a port of the
owner's reference products (D-198) or from 21st.dev components **revamped** into these tokens (D-044), never invented.

## Identity (from Masayume 68f7a09 `web/src/styles/yosuku/part-01.css`, `bridge.css`, `tokens.css`, `lib/fonts.ts`)

| Role | Dark (default) | Light (`[data-theme="light"]`) |
|---|---|---|
| Ground | `#050505` | paper (Yosuku light ramp) |
| Surfaces 1 / 2 / 3 | `#171717` / `#262626` / `#404040` | `#F6F0E4` / `#ECE3D2` / `#FBF7EE` |
| Hairline / strong border | `rgb(255 255 255 / 0.10)` / `0.22` | `rgb(20 18 16 / 0.12)` / `0.22` |
| Ink / secondary / muted / disabled | white / gray-400 / gray-500 / gray-600 | inverted ramp |
| **Accent (the only brand colour)** | vermilion `#E04D26` (pressed `#B83A1B`) | vermilion `#D93E1F` (pressed `#B83214`) |
| Direction only (candles, P&L, Up/Down) | profit `#34D399` · loss `#FB7185` | profit `#2E6B4F` · loss `#C2381F` |
| Receipt paper island (both themes) | cream `#F4EEE3`, ink `#141210`, hairline `#D9CBB0` — the app's one drop shadow | same |
| Warning / info | `#F2994A` / `#60A5FA` | same |

Faces (`next/font`, swap): **Sora** (headings/display), **Inter** (body), **JetBrains Mono** (every figure — prices,
stakes, balances, countdowns), **Noto Serif JP** (verdict stamps). Easings: `--ease` `cubic-bezier(0.4,0,0.2,1)`,
`--ease-out` `cubic-bezier(0.22,1,0.36,1)`, `--ease-bounce` `cubic-bezier(0.34,1.56,0.64,1)`.

Correction (2026-09-29): the plan's §2.2 and the 21st research say "Plex Mono" for numbers; Masayume uses
**JetBrains Mono** (`lib/fonts.ts`, `--font-data`). JetBrains Mono is authoritative.

## Rules

- **Tokens only.** No raw hex or px in component code (`design-literals` invariant); component tokens follow
  Masayume's `tokens.css` tiers (`--ticket-*`, `--market-card-*`, `--receipt-*`, …). `packages/tokens` (S1) is the one
  source for web CSS variables and the native Uniwind theme.
- **Overlays (owner rule, Masayume ledger 2026-09-04; kept by D-190):** centred modals and the right-edge slide-over;
  **no bottom sheets** (OS share sheets excepted). Long flows are floating right drawers (§Layout); small choices are
  centred modals. The `/markets` ticket is the right-edge slide-over that becomes the **dock column** at `lg:` (renamed
  from "rail", which now means the shell's sidebar).
- **Primitives:** Base UI only; lucide icons; `motion/react` `m.*` under `LazyMotion` with `MotionConfig
  reducedMotion="user"`; transforms and opacity only.
- **Phone first:** 390 px primary, no overflow at 320; ≥ 44 px targets; ≥ 16 px inputs; sticky CTA with safe-area inset.
- **Honesty grammar:** the CTA names its blocker; failures say whether money moved; every value move has a receipt.
- **States:** loading, empty, error, stale, blocked, pending and success on every surface.

## Layout (D-189, D-190; roy-chain `ede3ed38`, Slush study)

All sizes are `layout` tokens in `packages/tokens` (S22.1); none are written in component code.

| Piece | Geometry | Behaviour |
|---|---|---|
| Rail | floating, inset 16, width 248 (≥ 1280) / 88 icon rail (768–1279), radius 24, rail surface; items 48 high at 60 pitch | lucide icon + 18 px label; active pill moved by a CSS transform; hover pill 45 % over 120 ms; key hint 1–6; Testnet pill beside 見通し; account menu + money pill (privacy eye) at the foot; compaction at height ≤ 880 |
| Top line | search ⌘K · `?` · theme · AllowancePill · account; banners in its slot | hidden on `/trade` |
| Stage | `main` is one bordered panel: `radius.xl` (24), 2 px edge, surface-1 | `/trade` fills it edge to edge |
| Dock (< 768) | floating capsule, 5 items 56×60, 22 px icon, 12 px label, safe-area bottom | hidden on `/trade` |
| Drawer | floating right drawer: inset 16, width 384 / wide 560 (full width − inset on phones), `radius.xl`, 2 px edge, no blur, scrim | 380 ms `cubic-bezier(.32,.72,0,1)` in, 240 ms out; swipe right to dismiss; header back · centred title · ✕; state in `?d=` so Back closes and focus returns |
| Modal | centred, max 440, `radius.xl` | small choices only |
| Toasts | top-centre, max 3 | success 3.5 s, error 5 s, info 3.5 s, loading persistent; same id replaces |

## Feedback (sound, haptics, music — D-189, `revamp-parity.md` RV-70…RV-75)

- Cues are synthesised in code (Owarine `ecb7565b` `lib/sound/trade.ts`, to Tradash's measured contours); **no audio
  files ship**. One AudioContext, imported and unlocked on the first gesture, resumed on visibility, rebuilt if stuck.
- Tap cue (gain .3) + 8 ms haptic on rail, dock, drawers and chips; trade cues only in the terminal; music is off by
  default and stops when the tab hides; every sound respects the "Sound & Vibration" setting (`cwf.feedback.v1`).
- A sound never blocks or breaks an action: every audio error is swallowed.

## Chart token map (the terminal canvas reads these CSS variables at runtime)

| Chart element | Token |
|---|---|
| Line, pill, band — no position or PnL ≥ 0 / PnL < 0 | `--chart-up` / `--chart-down` |
| Grid, axis text, crosshair, ground | `--chart-grid`, `--chart-text`, `--chart-crosshair`, `--chart-ground` |
| Entry level | `--chart-text` |
| Line (the Window's opening print) | `--chart-down` |
| Break-even, Boost knock-out | `--warning` |
| TP / SL / Trail | `--chart-up` / `--chart-down` / current line colour |
| Signed tick (latest RedStone value) | `--accent-fill` |
| Epic callout, favourite star | `--warning` |
| Dot grid | `--ms-hairline` |
| Confetti | `--chart-up`, `--accent-fill`, `--warning`, `--cream` |

## 21st workflow (plan §2.3)

0. If the surface is ported from the owner's reference products (Owarine `ecb7565b`, Baku/roy-chain `ede3ed38`;
   D-198), start from that port; the trailer and a `components.md` row record it. Otherwise:
1. Start from the surface's pick in `docs/specs/ux.md` (E.1, E.4); otherwise `21st search "<need>" --context auto`.
2. `21st get <id>`; read its code (a11y, states, dependencies). Radix-built picks convert to Base UI (E.2 mapping).
3. Revamp into these tokens; wire real data and `TxLifecycle`; add every state.
4. `21st review <paths>` + axe; screenshots at 390/320/768/1440 in both themes.
5. Add a row to `components.md`.

The local `.21st/` context (for `--context auto` and `21st review`) is generated from `design.json` and is gitignored.
