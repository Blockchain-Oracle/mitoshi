// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/price-relay/boundary-cache.ts (RedStone part; Pyth removed).
/**
 * One gateway fetch per boundary for everything that needs it: refetched every 3 s while a feed still lacks a signer
 * until T + 60, every 30 s after that until T + 300 (a late fifth package lets a primary record before its strict
 * window ends), then frozen. Kept a day.
 */
import { feedAt } from "@cwf/markets/ops";
import { fetchRedstoneAt, type GatewayResponse, type RedstoneSources } from "../../prices/redstone-gateway";

const REFETCH_MS = 3_000;
const LATE_REFETCH_MS = 30_000;
const STRICT_MAX_SEC = 300;
const KEEP_SEC = 24 * 3600;

type Entry = { response: GatewayResponse | null; lastTryMs: number; frozen: boolean; inflight: Promise<GatewayResponse | null> | null; error: string | null };

export class BoundaryCache {
  private readonly byT = new Map<number, Entry>();
  constructor(private readonly sources: RedstoneSources, private readonly feeds: () => readonly string[]) {}

  private complete(response: GatewayResponse, tSec: number): boolean {
    return this.feeds().every((f) => (feedAt(response.text, f, tSec, this.sources.signers)?.packages.length ?? 0) >= this.sources.signerCount);
  }

  async redstone(tSec: number): Promise<GatewayResponse | null> {
    const entry = this.byT.get(tSec) ?? { response: null, lastTryMs: 0, frozen: false, inflight: null, error: null };
    this.byT.set(tSec, entry);
    if (entry.frozen || entry.inflight) return entry.inflight ?? entry.response;
    const every = entry.response && entry.response.fetchedAtMs / 1000 >= tSec + 60 ? LATE_REFETCH_MS : REFETCH_MS;
    if (entry.response && Date.now() - entry.lastTryMs < every) return entry.response;
    entry.lastTryMs = Date.now();
    entry.inflight = fetchRedstoneAt(tSec, this.sources.gateways)
      .then((response) => {
        entry.response = response;
        entry.error = null;
        entry.frozen = this.complete(response, tSec) || response.fetchedAtMs / 1000 >= tSec + STRICT_MAX_SEC;
        return response;
      })
      .catch((error: unknown) => {
        entry.error = error instanceof Error ? error.message : String(error);
        return entry.response;
      })
      .finally(() => (entry.inflight = null));
    return entry.inflight;
  }

  error(tSec: number): string | null {
    return this.byT.get(tSec)?.error ?? null;
  }

  prune(nowSec: number): void {
    for (const t of this.byT.keys()) if (t < nowSec - KEEP_SEC) this.byT.delete(t);
  }
}
