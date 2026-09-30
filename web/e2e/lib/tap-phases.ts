/**
 * Splits one tap's timeline into its phases (`e2e/tap-latency.ts`). Everything is epoch ms: the page's marks through
 * `performance.timeOrigin`, the network through Playwright's `request.timing().startTime`.
 */
export interface NetCall {
  where: string;
  method: string;
  startMs: number;
  endMs: number;
}

export interface TapMarks {
  press: number | null;
  start: number | null;
  sent: number | null;
  signed: number | null;
  done: number | null;
  card: number | null;
  confirmed: number | null;
}

export interface TapPhases {
  pressToHandlerMs: number | null;
  preSendMs: number | null;
  preSendReads: string[];
  fillMs: number | null;
  signMs: number | null;
  cosignMs: number | null;
  sendToReceiptMs: number | null;
  doneToCardMs: number | null;
  pressToCardMs: number | null;
  pressToConfirmedMs: number | null;
}

const span = (a: number | null, b: number | null) => (a !== null && b !== null ? Math.round(b - a) : null);

export function phasesOf(m: TapMarks, net: readonly NetCall[]): TapPhases {
  const from = m.press ?? m.start ?? 0;
  const inTap = net.filter((c) => c.startMs >= from - 5 && (m.confirmed === null || c.startMs <= m.confirmed + 5));
  const first = (where: string, method: RegExp) => inTap.find((c) => c.where === where && method.test(c.method)) ?? null;
  const fill = first("relay", /^eth_fillTransaction$/);
  const cosign = first("relay", /^eth_signRawTransaction$/);
  const send = first("rpc", /^eth_sendRawTransactionSync$/) ?? first("rpc", /^eth_sendRawTransaction$/);
  const reads = m.start !== null && m.sent !== null ? inTap.filter((c) => c.startMs >= m.start! - 5 && c.startMs <= m.sent! && c.where !== "relay") : [];
  return {
    pressToHandlerMs: span(m.press, m.start),
    preSendMs: span(m.start, m.sent),
    preSendReads: reads.map((c) => `${c.where}:${c.method} ${Math.round(c.endMs - c.startMs)}ms`),
    fillMs: fill ? Math.round(fill.endMs - fill.startMs) : null,
    // The key's signature sits between the fill's answer and the next request: the co-sign, or (the relay's fill already
    // carries the fee payer's signature) the raw send itself.
    signMs: fill && (cosign ?? send) ? Math.round((cosign ?? send)!.startMs - fill.endMs) : null,
    cosignMs: cosign ? Math.round(cosign.endMs - cosign.startMs) : null,
    sendToReceiptMs: send ? Math.round(send.endMs - send.startMs) : null,
    doneToCardMs: span(m.done, m.card),
    pressToCardMs: span(m.press, m.card),
    pressToConfirmedMs: span(m.press, m.confirmed),
  };
}

export function median(xs: readonly (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : Math.round((v[mid - 1]! + v[mid]!) / 2);
}

const KEYS = ["pressToHandlerMs", "preSendMs", "fillMs", "signMs", "cosignMs", "sendToReceiptMs", "doneToCardMs", "pressToCardMs", "pressToConfirmedMs"] as const;

/** p50 (and max) of every phase across the placed taps. */
export function summarize(rows: readonly TapPhases[]): Record<string, { p50: number | null; max: number | null }> {
  const out: Record<string, { p50: number | null; max: number | null }> = {};
  for (const k of KEYS) {
    const xs = rows.map((r) => r[k]);
    const v = xs.filter((x): x is number => x !== null);
    out[k] = { p50: median(xs), max: v.length ? Math.max(...v) : null };
  }
  return out;
}
