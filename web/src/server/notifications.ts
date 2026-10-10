import "server-only";
/**
 * The notification centre's items (S13 step 6; Agari 03b30ab `features/activity/{feed.server,items,describe}.ts` in
 * purpose): what happened to a wallet's calls — filled, won, lost, voided with the payout — and around it socially —
 * a new follower, a take by someone it follows — newest first, from the index and the social tables. All of it is
 * public on chain or on the site, so a wallet's centre reads with no session.
 */
import { formatCadence } from "@cwf/core/copy";
import { readSettledRounds, readWalletFills } from "@cwf/db/idx";
import { db } from "./db";
import { demandAddresses } from "./demand";
import { people, posts } from "./social";

export type NoticeKind = "filled" | "won" | "lost" | "void" | "follower" | "take";

export interface Notice {
  id: string;
  kind: NoticeKind;
  atSec: number;
  title: string;
  href: string | null;
}

const side = (kind: number) => (kind === 0 || kind === 3 ? "UP" : "DOWN");
const bought = (kind: number) => kind === 0 || kind === 2;
const cents = (kind: number, priceTicks: number) => Math.round((kind <= 1 ? priceTicks : 1000 - priceTicks) / 10);
const money = (base: bigint) => `$${(Number(base) / 1e6).toFixed(2)}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export async function readNotices(address: string, sinceSec: number): Promise<Notice[]> {
  const a = address.toLowerCase();
  const sql = db();
  const [fills, rounds, following, followers] = await Promise.all([
    readWalletFills(sql, { address: a, sinceSec, limit: 60 }),
    readSettledRounds(sql, { ...demandAddresses(), owner: a, sinceSec }),
    people().following(a),
    sql<{ follower: string; at: string }[]>`select follower, extract(epoch from created_at)::bigint::text as at from game_follows where followee = ${a} and created_at >= to_timestamp(${sinceSec}) order by created_at desc limit 30`,
  ]);
  const takes = following.length ? await posts().takes({ authors: following, viewer: a, limit: 20 }) : [];
  const names = await people().profiles([...followers.map((f) => f.follower), ...takes.map((t) => t.author)]);
  const who = (x: string) => (names.get(x)?.displayName ? `@${names.get(x)!.displayName}` : short(x));
  const items: Notice[] = [
    ...fills.map((f): Notice => ({
      id: `fill:${f.txHash}:${f.logIndex}:${f.via}`,
      kind: "filled",
      atSec: f.tsSec,
      title: f.via === "vault"
        ? `Trading Balance ${bought(f.kind) ? "bought" : "sold"} ${side(f.kind)} on ${f.symbol} ${formatCadence(f.cadenceSec)}`
        : `${bought(f.kind) ? "Your" : "You sold your"} ${side(f.kind)} on ${f.symbol} ${formatCadence(f.cadenceSec)} filled at ${cents(f.kind, f.priceTicks)}¢`,
      href: `/proof/${f.market}`,
    })),
    ...rounds.filter((r) => r.outcome !== "closed").map((r): Notice => ({
      id: `round:${r.market}`,
      kind: r.outcome === "win" ? "won" : r.outcome === "loss" ? "lost" : "void",
      atSec: r.settledSec,
      title: r.outcome === "win" ? `${r.symbol} ${formatCadence(r.cadenceSec)} settled your way — paid ${money(r.payoutBase)}`
        : r.outcome === "loss" ? `${r.symbol} ${formatCadence(r.cadenceSec)} settled against you`
        : `${r.symbol} ${formatCadence(r.cadenceSec)} voided — both sides paid 0.5, ${money(r.payoutBase)} to you`,
      href: `/proof/${r.market}`,
    })),
    ...followers.map((f): Notice => ({ id: `follower:${f.follower}`, kind: "follower", atSec: Number(f.at), title: `${who(f.follower)} followed you`, href: `/u/${f.follower}` })),
    ...takes.filter((t) => t.createdAtMs / 1000 >= sinceSec).map((t): Notice => ({ id: `take:${t.id}`, kind: "take", atSec: Math.floor(t.createdAtMs / 1000), title: `${who(t.author)} took ${t.side.toUpperCase()} on ${t.asset} ${formatCadence(t.intervalSec)}`, href: `/trade/${t.asset}?w=${t.marketId}` })),
  ];
  return items.sort((x, y) => y.atSec - x.atSec).slice(0, 80);
}
