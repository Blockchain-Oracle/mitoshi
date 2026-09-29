// Regenerates contracts/test/fixtures/book.vectors.json from Agari's book-walk vectors with the rest filter in
// seconds (A.1.1: `placedAt` / `minRestSec` replace `placed_slot` / `min_rest_slots`, E-64).
//
// Source: Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/tests/vectors/book.vectors.json (generated there by
// gen-book-vectors.mjs from the TS mirror). The slot axis maps 1:1 onto seconds: `placedAt = now − (slot − placedSlot)`,
// `minRestSec = minRestSlots`. The relation "rested iff placedSlot + minRest ≤ slot" becomes "placedAt + minRestSec ≤
// now" exactly, so every expectation carries over unchanged. Each case also gets flat numeric arrays the Solidity
// Lens test reads with vm.parseJsonUintArray (live orders only: dead nodes cannot exist linked in the EVM engine).
//
// Run: node scripts/fixtures/book-vectors-seconds.mjs <agari book.vectors.json> contracts/test/fixtures/book.vectors.json
import { readFileSync, writeFileSync } from "node:fs";

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error("usage: book-vectors-seconds.mjs <agari vectors> <out>");
const input = JSON.parse(readFileSync(src, "utf8"));

const convertOrder = (o, f) => {
  const { placedSlot, ...rest } = o;
  return { ...rest, placedAt: String(BigInt(f.now) - (BigInt(f.slot) - BigInt(placedSlot))) };
};
const flat = (orders) => orders.filter((o) => o.live).flatMap((o) => [o.price, Number(o.lots), Number(o.expireTs), Number(o.placedAt)]);
const flatLevels = (levels) => levels.flatMap(([p, q]) => [p, Number(q)]);

const cases = input.cases.map((c) => {
  const f = c.filter;
  const bids = c.bids.map((o) => convertOrder(o, f));
  const asks = c.asks.map((o) => convertOrder(o, f));
  const filter = { now: f.now, restedOnly: f.restedOnly, minRestSec: f.minRestSlots };
  const sol = {
    now: Number(f.now),
    n: c.n,
    minRestSec: f.restedOnly ? Number(f.minRestSlots) : 0,
    bids: flat(bids),
    asks: flat(asks),
    bidLevels: flatLevels(c.expect.bidLevels),
    askLevels: flatLevels(c.expect.askLevels),
  };
  return { ...c, name: c.name.replace(/slots/g, "s"), bids, asks, filter, sol };
});

const doc =
  "Book-walk vectors shared by EngineLens (Solidity, test/engine/Lens.t.sol) and the TS book-math mirror. Regenerated " +
  "from Agari 03b30ab anchor/tests/vectors/book.vectors.json with the rest filter in seconds (placedAt/minRestSec, 1:1 " +
  "onto Agari's slots) by scripts/fixtures/book-vectors-seconds.mjs; do not edit by hand. `sol` holds live orders as " +
  "flat [price, lots, expireTs, placedAt]… and expected levels as [price, lots]….";
writeFileSync(out, JSON.stringify({ _doc: doc, cases }, null, 1) + "\n");
console.log(`${cases.length} cases → ${out}`);
