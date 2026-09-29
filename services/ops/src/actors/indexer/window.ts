/**
 * The follower's window sizing (plan C.4.1 `window.ts`): ≤ 100k-block backfill windows, 2,000 when live, halved on a
 * provider error and grown back after successes. Tempo reads to `latest` (every block is final). Pure.
 */
export const BACKFILL_MAX = 100_000;
export const LIVE_MAX = 2_000;
export const MIN_WINDOW = 100;

export interface WindowState {
  size: number;
}

/** The next range after `cursor` toward `head`, or null when caught up. */
export function nextRange(cursor: number, head: number, state: WindowState): { from: number; to: number; live: boolean } | null {
  if (head <= cursor) return null;
  const behind = head - cursor;
  const live = behind <= LIVE_MAX;
  const size = Math.min(state.size, live ? LIVE_MAX : BACKFILL_MAX);
  return { from: cursor + 1, to: Math.min(head, cursor + size), live };
}

export const shrink = (state: WindowState) => void (state.size = Math.max(MIN_WINDOW, Math.floor(state.size / 2)));
export const grow = (state: WindowState) => void (state.size = Math.min(BACKFILL_MAX, state.size * 2));

/** The bus topics an applied engine event is published on (D-049). */
export function topicsOf(e: { name: string; market: string | null; data: Record<string, unknown> }): string[] {
  const out: string[] = [];
  if (e.market) out.push(`market:${e.market}`);
  const users = new Set<string>();
  const add = (k: string) => typeof e.data[k] === "string" && users.add((e.data[k] as string).toLowerCase());
  switch (e.name) {
    case "Fill":
      out.push("fills", "activity");
      add("taker");
      add("maker");
      break;
    case "OrderExecuted":
      add("taker");
      break;
    case "OrderRemoved":
    case "OrderReduced":
    case "CompleteSet":
    case "CreditWithdrawn":
      add("owner");
      break;
    case "Redeemed":
      add("holder");
      out.push("activity");
      break;
    case "PrintRecorded":
      out.push("prints");
      break;
    case "WindowResolved":
      out.push("verdicts", "markets");
      break;
    case "WindowOpened":
      out.push("markets");
      break;
  }
  for (const u of users) out.push(`user:${u}`);
  return out;
}
