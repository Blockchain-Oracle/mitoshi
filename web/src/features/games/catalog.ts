import { gameDescriptor, gamesInGroup, type GameDescriptor, type GameGroup, type GameId } from "@cwf/core/games";
import { NAV_ITEMS, type NavItem } from "@/components/shell/header/nav-items";

/**
 * What a mode is to a player standing in the hub.
 *
 * The name, one-line blurb, icon and href come from the navigation registry rather than being
 * restated here: a mode that is called one thing in the header and another on its card is a
 * defect no test would catch. The economic kind comes from `@cwf/core/games`, so the card's
 * honest label about whose money is at risk is the same fact the write lanes gate on.
 *
 * `readiness` is a build fact, not a chain read — it says whether the thing behind the route
 * exists in this repository yet. Range and Moonshot share Stage 5's reserve; the hub adds the
 * reserve's *live* state on top of that, because "built" and "playable right now" are different
 * claims and the card must not merge them.
 */
export type GameReadiness = { kind: "built" } | { kind: "pending"; dependency: string };

export interface GameEntry {
  id: GameId;
  nav: NavItem;
  descriptor: GameDescriptor;
  readiness: GameReadiness;
}

const NAV_BY_ID: Readonly<Record<GameId, NavItem>> = {
  practice: NAV_ITEMS.practice,
  duel: NAV_ITEMS.duel,
  lucky: NAV_ITEMS.lucky,
  range: NAV_ITEMS.range,
  moonshot: NAV_ITEMS.moonshot,
  "line-rider": NAV_ITEMS.lineRider,
  "candle-hop": NAV_ITEMS.candleHop,
};

/** Each pending mode names the concrete thing it waits on — a contract, a service, an engine. */
const READINESS: Readonly<Record<GameId, GameReadiness>> = {
  practice: { kind: "built" },
  duel: { kind: "pending", dependency: "the arena contracts" },
  lucky: { kind: "built" },
  range: { kind: "built" },
  moonshot: { kind: "built" },
  "line-rider": { kind: "built" },
  "candle-hop": { kind: "built" },
};

/** What a mode still waits on, for the page that stands in for it; "built" never reaches a pending page. */
export function pendingDependency(id: GameId): string {
  const readiness = READINESS[id];
  return readiness.kind === "pending" ? readiness.dependency : "built";
}

export function gameEntry(id: GameId): GameEntry {
  return { id, nav: NAV_BY_ID[id], descriptor: gameDescriptor(id), readiness: READINESS[id] };
}

export function gameEntriesInGroup(group: GameGroup): readonly GameEntry[] {
  return gamesInGroup(group).map((descriptor) => gameEntry(descriptor.id));
}

/** The route a stage is on, or `null` on the hub itself — the rail's only piece of routing. */
export function gameIdFromPath(pathname: string | null): GameId | null {
  if (!pathname) return null;
  const rest = pathname.startsWith("/games/") ? pathname.slice("/games/".length) : null;
  if (!rest) return null;
  const id = rest.split("/")[0] ?? "";
  return id in NAV_BY_ID ? (id as GameId) : null;
}
