/**
 * The Tempo transport the wallet layer hands wagmi (plan C.3.1): reads and sends go to the RPC; `eth_fillTransaction`
 * and a sponsored raw send (`feePayer: true`, no fee-payer signature yet) go to our relay first, which co-signs within
 * policy — the routing of viem 2.56's `withRelay` (D-055), rebuilt here with retries off at the proxy (X20: viem's
 * `createTransport` bakes 3 retries into `withRelay`, and with the RPC's own retries one relay refusal became ~50
 * requests and a tap that outlived its 25 s expiring window). A refusal comes back at once; reads keep one RPC retry.
 * Lives here because only `@cwf/markets` imports `viem/tempo` (chain-io-boundary).
 */
import { createTransport, fallback, http, webSocket, type Hex, type Transport } from "viem";
import { Transaction } from "viem/tempo";

/** Moderato's rate-limit answer ("Request exceeds defined limit. rate limited, try again in 118ms"), with its hint. */
export function rateLimitDelayMs(error: unknown): number | null {
  const text = [error, (error as { details?: unknown })?.details, (error as { cause?: { message?: unknown } })?.cause?.message].map((x) => (x instanceof Error ? x.message : String(x ?? ""))).join(" ");
  if (!/rate limited|exceeds defined limit|status: 429/i.test(text)) return null;
  const hint = /try again in (\d+)\s*ms/i.exec(text);
  return Math.min(hint ? Number(hint[1]) + 25 : 250, 2_000);
}

/**
 * A request that is safe to repeat (never a raw send) is retried only when the RPC rate-limited it, after the hinted
 * delay, at most three times (X21: five concurrent taps from one IP met Moderato's limit).
 */
async function withRateLimitRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const delay = rateLimitDelayMs(error);
      if (delay === null || attempt >= 3) throw error;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/** Routes like viem's `withRelay` (policy "sign-only"), with no retries of its own beyond rate limits. */
export function relayProxy(rpc: Transport, relay: Transport, send: Transport = rpc): Transport {
  return (config) => {
    const rpcT = rpc(config);
    const sendT = send(config);
    const relayT = relay(config);
    return createTransport({
      key: "relayProxy",
      name: "Relay Proxy",
      type: "relayProxy",
      retryCount: 0,
      request: (async ({ method, params }: { method: string; params?: unknown }, options?: unknown) => {
        if (method === "eth_fillTransaction") return withRateLimitRetry(() => relayT.request({ method, params } as never, options as never));
        if (method === "eth_sendRawTransactionSync" || method === "eth_sendRawTransaction") {
          const serialized = (params as [Hex])[0];
          const tx = Transaction.deserialize(serialized as never) as { feePayerSignature?: unknown };
          if (tx.feePayerSignature === null) {
            const signed = await withRateLimitRetry(() => relayT.request({ method: "eth_signRawTransaction", params: [serialized] } as never, options as never));
            return sendT.request({ method, params: [signed] } as never, options as never);
          }
          return sendT.request({ method, params } as never, options as never);
        }
        return withRateLimitRetry(() => rpcT.request({ method, params } as never, options as never));
      }) as never,
    });
  };
}

export function tempoTransport(input: { rpcHttpUrls: readonly string[]; rpcWsUrls?: readonly string[]; relayUrl: string; batch?: boolean }): Transport {
  const https = input.rpcHttpUrls.map((url) => http(url, { batch: input.batch ?? true, retryCount: 1 }));
  const sockets = typeof WebSocket === "undefined" ? [] : (input.rpcWsUrls ?? []).map((url) => webSocket(url, { retryCount: 1 }));
  const all = [...sockets, ...https];
  const rpc = all.length === 1 ? all[0]! : fallback(all);
  // A raw send is never retried by the transport (AD-3): the gateway can answer 502 after accepting the tx, and a
  // blind resend of the same bytes came back ~60 s later refused ("valid_before too close", S4). An ambiguous send is
  // journaled unknown and reconciled by its expiring window instead.
  const send = http(input.rpcHttpUrls[0]!, { batch: false, retryCount: 0 });
  return relayProxy(rpc, http(input.relayUrl, { retryCount: 0 }), send);
}
