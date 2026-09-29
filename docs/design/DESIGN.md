# Design system — the source for every UI step (plan §2, Appendix E)

Masayume's identity is kept (owner answer D-009): the Yosuku-derived palette, faces, layout and every flow. New
surfaces and weak-UX screens are built from 21st.dev components **revamped** into these tokens (D-044), never invented.

## Identity (from Masayume 68f7a09 `web/src/styles/yosuku/part-01.css`, `bridge.css`, `tokens.css`, `lib/fonts.ts`)

| Role | Dark (default) | Light (`[data-theme="light"]`) |
|---|---|---|
| Ground | `#050505` | paper (Yosuku light ramp) |
| Surfaces 1 / 2 / 3 | `#171717` / `#262626` / `#404040` | `#F6F0E4` / `#ECE3D2` / `#FBF7EE` |
| Hairline / strong border | `rgb(255 255 255 / 0.10)` / `0.22` | `rgb(20 18 16 / 0.12)` / `0.22` |
| Ink / secondary / muted / disabled | white / gray-400 / gray-500 / gray-600 | inverted ramp |
| **Accent (the only brand colour)** | vermilion `#E04D26` (pressed `#B83A1B`) | same |
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
- **Overlays (owner rule, Masayume ledger 2026-09-04):** centred modals and the right-edge slide-over; **no bottom
  sheets** (OS share sheets excepted). The ticket is the right-edge slide-over that becomes the rail at `lg:`.
- **Primitives:** Base UI only; lucide icons; `motion/react` `m.*` under `LazyMotion` with `MotionConfig
  reducedMotion="user"`; transforms and opacity only.
- **Phone first:** 390 px primary, no overflow at 320; ≥ 44 px targets; ≥ 16 px inputs; sticky CTA with safe-area inset.
- **Honesty grammar:** the CTA names its blocker; failures say whether money moved; every value move has a receipt.
- **States:** loading, empty, error, stale, blocked, pending and success on every surface.

## 21st workflow (plan §2.3)

1. Start from the surface's pick in `docs/specs/ux.md` (E.1, E.4); otherwise `21st search "<need>" --context auto`.
2. `21st get <id>`; read its code (a11y, states, dependencies). Radix-built picks convert to Base UI (E.2 mapping).
3. Revamp into these tokens; wire real data and `TxLifecycle`; add every state.
4. `21st review <paths>` + axe; screenshots at 390/320/768/1440 in both themes.
5. Add a row to `components.md`.

The local `.21st/` context (for `--context auto` and `21st review`) is generated from `design.json` and is gitignored.
