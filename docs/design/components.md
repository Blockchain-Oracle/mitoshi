# Component register (append-only)

Every adopted 21st.dev component (and every native screen reproducing one) gets a row. Plan D-044 / §2.3.

| Component (ours) | From 21st (id · author/slug) or `native-of` | Used in | What changed | Stage |
|---|---|---|---|---|
| `web/src/components/ui/swap-ticket.tsx` (`SwapTicket`) | 27122 · ssychui/swap-ticket | `/dev/x23` fixture (S1 X23); stock buy/sell and cash-out in S15 | framer-motion → `m.*`; shadcn vars/literals → Masayume tokens (`bg-surface-*`, `border-hairline`, `type-*`, `size-touch`); float prices → bigint base units + `formatUnits`; own validation → host's blocker string as the CTA (D-045); footer → min received, price guard, quote age (E.1); listbox overlay → labelled in-card dialog with focus + Escape; ≥ 44 px targets; "Max" in ink (vermilion small text fails AA) | S1 |
| `web/src/components/ui/drawer.tsx` (`SlideOver`) + `styles/drawer.css` | 31360 · wensity/drawer | More panel (S1); ticket, parlay slip, arm flows later | Right edge only (`swipeDirection="right"`, owner rule — no bottom/top/fullscreen, no snap points, no handle); tokens instead of `--primitive-*`; lucide `X`; close button 44 px below the top safe area; motion in CSS keyed to `data-starting/ending-style` + `--drawer-swipe-*` (Base UI Drawer docs "right" recipe); full width ≤ 480 px | S1 |
| `web/src/components/ui/command-palette.tsx` + `styles/command.css` | 31354 · wensity/command | Header search / ⌘K (S1) | Fed by the nav registry; nested pages dropped; centred Base UI Dialog + inline Autocomplete kept; 44 px options, 16 px input; tokens; lucide; loaded on first open (lazy island) | S1 |
| `web/src/components/states/EmptyState.tsx` | 19745 · cnippet-dev/cnippet-empty | Every empty surface | Layout (media, title, detail, action; centred, balanced) over Masayume's contract (why + next action); tokens; no cva | S1 |
| `web/src/components/states/NotFound.tsx` | 29419 · ziegfiroyt/error9 | `app/not-found.tsx` | Distinct not-found words (it said "moved"); struck-through requested path; suggestion from the nav registry; 44 px way out; tokens | S1 |
