// `/status`'s rows in plain words (R6 shell T15): each keeper's line is built from its structured `detail` (ops
// `/health`, read live 2026-10-13), never its raw log line ("live 39433709..39433712 (+0 events) · 0 behind · vault
// 0xdbb3Fa …"). An actor without a rule here falls back to its own first clause with hex addresses and raw e8 numbers
// taken out. Pure, so it is tested on real frames.
type Detail = Record<string, unknown> | undefined;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** The actor's own sentence up to its first " | " or " · ", without addresses, hashes or 8-decimal prices. */
export function plainWhy(why: string | undefined): string {
  const head = (why ?? "").split(" | ")[0]!.trim();
  const clean = head
    .replace(/0x[0-9a-f]{6,}/gi, "")
    .replace(/\b\d{9,}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/[\s·,:]+$/, "")
    .trim();
  return clean.length > 120 ? `${clean.slice(0, 119)}…` : clean;
}

const match = (why: string | undefined, re: RegExp) => re.exec(why ?? "");

/** The row's detail line for one keeper. */
export function rowDetail(actor: string, detail: Detail, why: string | undefined): string {
  const d = detail ?? {};
  switch (actor) {
    case "chain-head": {
      const lag = num(d.lagMs);
      return lag === null ? plainWhy(why) : `New block ${Math.max(0, Math.round(lag / 1000))} s ago`;
    }
    case "indexer": {
      const lag = num(d.lagBlocks);
      return lag === null ? plainWhy(why) : lag <= 3 ? "Up to date" : `${plural(lag, "block")} behind`;
    }
    case "spot-feed": {
      const feeds = num(d.feeds);
      const of = num(d.of);
      return feeds === null || of === null ? plainWhy(why) : `${feeds} of ${of} fresh`;
    }
    case "price-relay": {
      const live = num(d.liveWindows);
      const due = num(d.due);
      return live === null ? plainWhy(why) : `${plural(live, "Window")} · ${!due ? "none due" : `${due} due`}`;
    }
    case "display-crypto": {
      const symbols = [...(why ?? "").matchAll(/\b([A-Z]{2,6}) \d{6,}/g)].map((m) => m[1]!);
      return symbols.length ? `${symbols.join(", ")} streaming` : plainWhy(why);
    }
    case "display-stocks": {
      const n = match(why, /(\d+) ticker/);
      return n ? `${plural(Number(n[1]), "stock")} streaming` : plainWhy(why);
    }
    case "archive": {
      const backlog = num(d.backlog);
      return backlog === null ? plainWhy(why) : backlog === 0 ? "Up to date" : `${backlog} behind`;
    }
    case "window-roller": {
      const lanes = d.lanes && typeof d.lanes === "object" ? Object.values(d.lanes as Record<string, unknown>).map(String) : null;
      if (!lanes) return plainWhy(why);
      const count = (word: string) => lanes.filter((s) => s.startsWith(word)).length;
      return `${plural(lanes.length, "lane")} · ${count("open")} open · ${count("paused")} paused`;
    }
    case "seed-maker": {
      const quoting = num(d.quoting);
      const trading = num(d.trading);
      return quoting === null || trading === null ? plainWhy(why) : `Quoting ${quoting} of ${trading}`;
    }
    case "earn-quoter": {
      const m = match(why, /(\d+) quoted of (\d+) live crypto/);
      return m ? `Quoting ${m[1]} of ${m[2]} crypto Windows` : plainWhy(why);
    }
    case "settler": {
      const tracked = num(d.tracked);
      const due = match(why, /(\d+) due/);
      return tracked === null ? plainWhy(why) : `${tracked} tracked · ${!due || due[1] === "0" ? "none due" : `${due[1]} due`}`;
    }
    case "exit-keeper": {
      const armed = num(d.armed);
      return armed === null ? plainWhy(why) : armed === 0 ? "No armed exits" : `${armed} armed`;
    }
    case "leverage-keeper": {
      const live = num(d.live);
      return live === null ? plainWhy(why) : live === 0 ? "No open boosts" : `${live} open`;
    }
    case "halt-watch": {
      const halts = d.halts && typeof d.halts === "object" ? Object.keys(d.halts as object) : null;
      return halts === null ? plainWhy(why) : halts.length === 0 ? "No halts" : `Halted: ${halts.join(", ")}`;
    }
    case "calendar":
      return (why ?? "").split(" · ")[0]!.trim() || plainWhy(why);
    default:
      return plainWhy(why);
  }
}
