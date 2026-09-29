/** Lists the live Windows a drive can trade right now (read-only): `tsx drive/lib/peek.ts`. */
import { label, liveWindows, testnetVenue } from "./live-windows";

const { client, venue } = testnetVenue();
const now = Math.floor(Date.now() / 1000);
for (const w of await liveWindows(client, venue, now)) {
  console.log(label(w), w.market.marketId, `lock in ${w.market.lockAtSec - now}s`, `bid ${w.top.bidTicks}×${w.top.bidLots}`, `ask ${w.top.askTicks}×${w.top.askLots}`);
}
