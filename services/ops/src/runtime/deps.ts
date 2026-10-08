// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/runtime/deps.ts (+ the stream bus and one Postgres pool).
import type { Sql } from "@cwf/db";
import type { SessionService } from "../calendar/session-service";
import type { DisplayFeed } from "../display/types";
import type { SpotFeed } from "../prices/spot";
import type { RedstoneSources } from "../prices/redstone-gateway";
import type { Log } from "./actor";
import type { Bus } from "./bus";
import type { OpsEnv } from "./env";
import type { HaltBoardStore } from "./halt-board";
import type { SessionEvents } from "./session-events";

/** What `main.ts` hands every venue actor: one calendar, spot feed, halt board, events reader, bus and pool per process. */
export interface VenueDeps {
  env: OpsEnv;
  log: Log;
  sessions: SessionService;
  /** Null when no spot feed runs in this process. */
  spot: SpotFeed | null;
  /** The chart line's feed (D-196): a risk signal for the seed maker, never a price it settles or quotes on. */
  display: DisplayFeed | null;
  /** Written only by `halt-watch`; read by the roller, the maker and `/session`. */
  halts: HaltBoardStore;
  events: SessionEvents;
  bus: Bus;
  /** Null without DATABASE_URL (the indexer and archive readers then idle). */
  sql: Sql | null;
  redstone: RedstoneSources;
}
