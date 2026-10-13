// One answer for the chart and the tabs (R6 money, S02; D-230): they come from one request, so they always agree —
// reading, failed, the index still behind this launch (it is newer than what the followers have read), no trades yet
// (only after a read that succeeded with none), or trades. Pure.
import type { LaunchFeedWire, Reading } from "@cwf/core";

export type FeedState = "loading" | "error" | "indexing" | "empty" | "ready";

export function feedState(feed: Reading<LaunchFeedWire> | null, createdBlock: bigint | null): FeedState {
  if (feed === null) return "loading";
  if (!feed.ok) return "error";
  const f = feed.value;
  const behind = f.launch === null || (createdBlock !== null && f.indexedTo !== null && BigInt(f.indexedTo.block) < createdBlock);
  if (behind) return "indexing";
  return f.trades.length === 0 ? "empty" : "ready";
}
