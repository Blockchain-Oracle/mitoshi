// Every LoadingState shape by name (R6 T18, D-230): generic shapes in pages.tsx, each page's own outline in its feature
// file. Every pre-R6 name still renders; the new page shapes are drawn from their settled pages' boxes.
import type { ReactNode } from "react";
import { agentsBoard, cockpit, strategyGrid, studio } from "./automate";
import { game, gameList, gamesHall, gameStage, podium } from "./games";
import { hero, marketsHero, marketsRail } from "./markets";
import { earn, portfolio } from "./money";
import { cards, chart, line, page, plate, row, table, ticket, tiles } from "./pages";
import { parlay } from "./parlay";
import { profile } from "./profile";
import { stats } from "./stats";
import { halts, status } from "./status";

export const SHAPES = {
  line, row, plate, chart, ticket, cards, page, hero, tiles, table, podium,
  "strategy-grid": strategyGrid, studio, "agents-board": agentsBoard, cockpit, portfolio, earn, game,
  "markets-hero": marketsHero, "markets-rail": marketsRail, stats, status, halts, profile,
  "games-hall": gamesHall, "game-stage": gameStage, "game-list": gameList, parlay,
} satisfies Record<string, () => ReactNode>;

export type LoadingShape = keyof typeof SHAPES;
