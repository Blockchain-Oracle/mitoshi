// LoadingState's generic shapes by name (R6 T18, D-230). Each page's own outline lives in its feature file
// (`./automate`, `./money`…) and is imported where it's drawn, as `<LoadingFrame shape="…">{portfolio()}</LoadingFrame>`:
// a registry of every shape put every skeleton into every route's first load (route budgets).
import type { ReactNode } from "react";
import { cards, chart, line, page, plate, row, table, ticket, tiles } from "./pages";

export const SHAPES = { line, row, plate, chart, ticket, cards, page, tiles, table } satisfies Record<string, () => ReactNode>;

export type LoadingShape = keyof typeof SHAPES;
