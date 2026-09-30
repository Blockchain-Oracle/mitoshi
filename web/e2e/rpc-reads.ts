/**
 * What a page asks the chain for in its first seconds (D-152): every Multicall3 `aggregate3` the page sends over the RPC
 * WebSocket, broken down by inner selector (e.g. `0xcb24b093` EngineLens.marketOf, `0x77688156` marketRef,
 * `0x2445ebb2` levels, `0x03b773ed` seriesOf), with send/receive times and response sizes, plus any HTTP response over
 * 20 KB. It is how the duplicate lane read (the same ~69 Windows read twice per /markets load, 230 KB each) was found;
 * run it after a change to the read layer to see that each Window is read once.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/rpc-reads.ts http://localhost:3104 /markets
 */
import { chromium } from "@playwright/test";
import { decodeFunctionData, multicall3Abi, type Hex } from "viem";

const [base = "http://localhost:3104", route = "/markets"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const t0 = Date.now();
const sent = new Map<string, string>();
const rows: { atMs: number; bytes: number; what: string }[] = [];

function describe(payload: string): { id: string; what: string } | null {
  try {
    const j = JSON.parse(payload) as { id?: unknown; method?: string; params?: { data?: string }[] };
    const data = j.params?.[0]?.data;
    if (!data?.startsWith("0x82ad56cb")) return { id: String(j.id), what: String(j.method) };
    const calls = (decodeFunctionData({ abi: multicall3Abi, data: data as Hex }).args[0] as readonly { callData: Hex }[]);
    const bySelector: Record<string, number> = {};
    for (const c of calls) bySelector[c.callData.slice(0, 10)] = (bySelector[c.callData.slice(0, 10)] ?? 0) + 1;
    return { id: String(j.id), what: `aggregate3 ×${calls.length} ${JSON.stringify(bySelector)}` };
  } catch {
    return null;
  }
}

page.on("websocket", (ws) => {
  ws.on("framesent", (f) => {
    const d = describe(String(f.payload));
    if (!d) return;
    sent.set(d.id, d.what);
    if (d.what.startsWith("aggregate3")) rows.push({ atMs: Date.now() - t0, bytes: 0, what: `SEND ${d.what}` });
  });
  ws.on("framereceived", (f) => {
    const text = String(f.payload);
    let id = "";
    try { id = String((JSON.parse(text) as { id?: unknown }).id); } catch { /* not ours */ }
    const what = sent.get(id);
    if (what?.startsWith("aggregate3")) rows.push({ atMs: Date.now() - t0, bytes: text.length, what: `RECV ${what}` });
  });
});
page.on("requestfinished", async (r) => {
  const s = await r.sizes().catch(() => null);
  if (s && s.responseBodySize > 20_000) rows.push({ atMs: Date.now() - t0, bytes: s.responseBodySize, what: `HTTP ${r.method()} ${r.url().slice(0, 120)}` });
});

await page.goto(`${base}${route}`, { waitUntil: "load" });
await page.waitForTimeout(12_000);
for (const r of rows.sort((a, b) => a.atMs - b.atMs)) console.log(JSON.stringify(r));
await browser.close();
