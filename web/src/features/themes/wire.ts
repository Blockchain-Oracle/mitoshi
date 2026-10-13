// What `/themes*`'s server half hands its client half (R6, D-230; D-231): plain values, base units as strings.
import type { BasketSpec } from "@cwf/core";
import type { DecisionWire, StrategyWire } from "@/features/strategies/protocol";
import type { MixPoint } from "./mix";

/** One theme: its strategy as the desk reads it from the index, and its basket. */
export interface ThemeWire {
  card: StrategyWire;
  spec: BasketSpec;
}

/** A card's week: the weighted mix (thinned), its move, the weighted price now, and any stock without closes. */
export interface CardMix {
  points: MixPoint[];
  moveBps: number | null;
  priceUsd: number | null;
  missing: string[];
}

/** A theme's calls: the latest Windows it took a side on, newest first, and how many it has ever called. */
export interface ThemeCalls {
  calls: DecisionWire[];
  total: number;
}
