# Component register (append-only)

Every adopted 21st.dev component (and every native screen reproducing one) gets a row. Plan D-044 / §2.3.

| Component (ours) | From 21st (id · author/slug) or `native-of` | Used in | What changed | Stage |
|---|---|---|---|---|
| `web/src/components/ui/swap-ticket.tsx` (`SwapTicket`) | 27122 · ssychui/swap-ticket | `/dev/x23` fixture (S1 X23); stock buy/sell and cash-out in S15 | framer-motion → `m.*`; shadcn vars/literals → Masayume tokens (`bg-surface-*`, `border-hairline`, `type-*`, `size-touch`); float prices → bigint base units + `formatUnits`; own validation → host's blocker string as the CTA (D-045); footer → min received, price guard, quote age (E.1); listbox overlay → labelled in-card dialog with focus + Escape; ≥ 44 px targets; "Max" in ink (vermilion small text fails AA) | S1 |
