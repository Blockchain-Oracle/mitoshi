/**
 * Read-endpoint health (Masayume 68f7a09:packages/markets/src/runtime/health.ts, over HTTP for Tempo).
 *
 * Health means a real `eth_chainId` round trip completed inside the timeout AND the endpoint reports the chain we
 * expect — a live endpoint on the wrong chain is not healthy. Observation only: nothing here rotates an endpoint or
 * touches a signer.
 */
const PROBE_TIMEOUT_MS = 4_000;

export interface EndpointHealth {
  url: string;
  index: number;
  healthy: boolean;
  latencyMs: number | null;
  chainId: number | null;
  checkedAtMs: number | null;
  consecutiveFailures: number;
}

const health = new Map<string, EndpointHealth>();

async function probe(url: string, expectedChainId: number, timeoutMs: number): Promise<{ healthy: boolean; latencyMs: number | null; chainId: number | null }> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = (await res.json()) as { result?: string };
    const chainId = typeof payload.result === "string" ? Number.parseInt(payload.result, 16) : null;
    const healthy = res.ok && chainId === expectedChainId;
    return { healthy, latencyMs: healthy ? Date.now() - started : null, chainId };
  } catch {
    return { healthy: false, latencyMs: null, chainId: null };
  }
}

/** Probes every endpoint in parallel and records what each one said. */
export async function checkEndpoints(urls: readonly string[], expectedChainId: number, timeoutMs = PROBE_TIMEOUT_MS): Promise<readonly EndpointHealth[]> {
  return Promise.all(
    urls.map(async (url, index) => {
      const result = await probe(url, expectedChainId, timeoutMs);
      const previous = health.get(url);
      const entry: EndpointHealth = {
        url, index, ...result, checkedAtMs: Date.now(),
        consecutiveFailures: result.healthy ? 0 : (previous?.consecutiveFailures ?? 0) + 1,
      };
      health.set(url, entry);
      return entry;
    }),
  );
}

/** Everything known so far, for the status surface. Never a render gate. */
export function endpointHealth(): readonly EndpointHealth[] {
  return [...health.values()].sort((a, b) => a.index - b.index);
}
