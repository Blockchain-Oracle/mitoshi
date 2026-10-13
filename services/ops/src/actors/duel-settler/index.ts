// Ported from Masayume 68f7a09:services/ops/src/actors/duel-settler/index.ts (R4-9, D-227) — onto `runActor` (one pass at
// a time, a why-string per pass, backoff, heartbeat) and the ops write path (`sendOps`: simulate, then a self-paid
// expiring-nonce Tempo tx from the `settler` role).
/**
 * duel-settler: one key, cranking what the arena already lets anyone crank — `lockPicks` once the pick window has
 * closed, `settleCard` once a played card's Window is resolved or voided, `finalize` once every played card is settled,
 * and the two refunds once their windows have closed. It decides nothing (core's rules and the arena's own checks do):
 * the key buys promptness, so it can be dry-run, restarted or switched off without anyone's money being at risk — the
 * duel page offers every one of these calls to any player. The deck is opened by the players' browsers (the reveal
 * material is released to them once both pots are in), so the settler never holds it.
 *
 * Its worklist is the record (`duel_matches` still undecided, last two days), each match read from the arena and
 * decided on the arena's own state; the record follows the chain on the way (status, P&Ls, the revealed cards and
 * finalize's winner), which is what History and the ladder read. No `settler` key or `DRY_RUN` → scan and report only.
 */
import { encodeFunctionData, type Hex } from "viem";
import { engineLensAbi } from "@cwf/clients/abis/EngineLens";
import { gameArenaAbi } from "@cwf/clients/abis/GameArena";
import { arenaStatusOf, arenaWinnerOf, type ArenaMatch, type ArenaParams } from "@cwf/core/games";
import { toMarketId, type Address, type Bytes32, type MarketId } from "@cwf/core";
import { createPgDuelStore } from "@cwf/db";
import { createOpsClient, OpsSendError, sendOps, venueOf } from "@cwf/markets/ops";
import { arenaOf } from "@cwf/markets/arena";
import { errorText, roleKey, runActor, type VenueDeps } from "../../runtime";
import { decideMatch, isDone, type SettlerAction } from "./decide";

const DEFAULT_REFRESH_MS = 20_000;
const WORKLIST_SEC = 2 * 24 * 3_600;
/** "Someone got there first" or "not yet": look again next pass rather than count a failure. */
const BENIGN = new Set(["WrongStatus", "AlreadySettled", "MarketNotSettled", "DeadlineNotPassed", "CardsOutstanding"]);

type MatchTuple = { creator: Address; tier: number; status: number; deckSize: number; pickedMask0: number; challenger: Address; pickedMask1: number; settledMask: number; policyVersion: number; deckHash: Hex; createdAtSec: bigint; joinedAtSec: bigint; revealedAtSec: bigint; pickDeadlineSec: bigint; potBase: bigint; perCardCapBase: bigint };

export function duelSettlerRefreshMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.DS_REFRESH_MS);
  return Number.isFinite(n) && n >= 5_000 ? n : DEFAULT_REFRESH_MS;
}

function callOf(action: SettlerAction): Hex | null {
  const fn = { "arena-lock": "lockPicks", "arena-finalize": "finalize", "arena-refund-unjoined": "refundUnjoined", "arena-refund-unrevealed": "refundUnrevealed" } as const;
  if (action.kind === "arena-reveal") return null;
  if (action.kind === "arena-settle-card") return encodeFunctionData({ abi: gameArenaAbi, functionName: "settleCard", args: [action.matchId, action.cardIndex] });
  return encodeFunctionData({ abi: gameArenaAbi, functionName: fn[action.kind], args: [action.matchId] });
}

export function startDuelSettler(deps: VenueDeps): { stop: () => void } {
  const key = roleKey("settler", deps.env.network, process.env, deps.env.keysDir);
  const client = createOpsClient({ network: deps.env.network, rpcUrl: deps.env.tempoRpcUrl, privateKey: key, tier: 1 });
  const arena = arenaOf(client.chainId)?.gameArena ?? null;
  const venue = venueOf(client.chainId);
  const store = deps.sql ? createPgDuelStore(deps.sql) : null;
  const dryRun = deps.env.dryRun || !key;
  if (!key) deps.log("SETTLER_PRIVATE_KEY / settler.json missing: scanning and reporting only");
  const counts: Record<string, number> = {};
  let recent: Array<{ action: string; matchId: string; tx: string }> = [];

  const read = <T>(address: Hex, abi: unknown, functionName: string, args: readonly unknown[] = []) =>
    client.public.readContract({ address, abi: abi as never, functionName: functionName as never, args: args as never }) as Promise<T>;

  const send = async (action: SettlerAction): Promise<string> => {
    const label = `${action.kind}${"cardIndex" in action ? `#${action.cardIndex}` : ""} ${action.matchId.slice(0, 10)}`;
    const data = callOf(action);
    if (!data) return `${label}: the players open the deck`;
    if (dryRun) return `DRY ${label}`;
    try {
      const sent = await sendOps(client, [{ to: arena!, data }]);
      counts[action.kind] = (counts[action.kind] ?? 0) + 1;
      recent = [{ action: action.kind, matchId: action.matchId, tx: sent.hash }, ...recent].slice(0, 20);
      return `${label} ${sent.hash.slice(0, 10)}`;
    } catch (error) {
      const name = error instanceof OpsSendError ? error.errorName : null;
      if (name && BENIGN.has(name)) return `${label}: ${name}`;
      counts.failed = (counts.failed ?? 0) + 1;
      return `${label} failed: ${errorText(error).slice(0, 140)}`;
    }
  };

  const pass = async () => {
    if (!arena || !venue) return { why: "GameArena is not deployed on this network; idle" };
    if (!store) return { why: "no DATABASE_URL, so no duel record to read a worklist from; idle" };
    const ids = await store.live(WORKLIST_SEC, 50);
    if (ids.length === 0) return { why: `no live duel · ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ") || "nothing sent yet"}${dryRun ? " · DRY RUN" : ""}` };
    const p = await read<readonly [number, number, number, number, number, number]>(arena, gameArenaAbi, "params");
    const params: ArenaParams = { joinWindowSec: p[0], revealWindowSec: p[1], pickWindowSec: p[2], minDeckSize: p[3], maxDeckSize: p[4], minCardLifeSec: p[5] };
    const nowSec = Number((await client.public.getBlock()).timestamp);
    const notes: string[] = [];
    for (const id of ids) {
      const matchId = id as Bytes32;
      const m = await read<MatchTuple>(arena, gameArenaAbi, "matchOf", [matchId]);
      if (m.creator === "0x0000000000000000000000000000000000000000") continue; // committed, never opened on chain
      const match: ArenaMatch = { matchId, creator: m.creator.toLowerCase() as Address, challenger: m.challenger.toLowerCase() as Address, tier: m.tier, status: arenaStatusOf(m.status), deckSize: m.deckSize, pickedMask0: m.pickedMask0, pickedMask1: m.pickedMask1, settledMask: m.settledMask, policyVersion: m.policyVersion, deckHash: m.deckHash as Bytes32, createdAtSec: Number(m.createdAtSec), joinedAtSec: Number(m.joinedAtSec), revealedAtSec: Number(m.revealedAtSec), pickDeadlineSec: Number(m.pickDeadlineSec), potBase: m.potBase, perCardCapBase: m.perCardCapBase };
      const cards: MarketId[] = (await read<readonly Hex[]>(arena, gameArenaAbi, "deckOf", [matchId])).map(toMarketId);
      const [creatorPnl, challengerPnl] = await read<readonly [bigint, bigint]>(arena, gameArenaAbi, "pnlOf", [matchId]);
      await store.setStatus(matchId, match.status, { winner: match.status === "finalized" ? arenaWinnerOf(match, creatorPnl, challengerPnl) : null, creatorPnl: creatorPnl.toString(), challengerPnl: challengerPnl.toString(), cards: cards.length ? cards : undefined });
      if (isDone(match)) continue;
      const settleable = new Set<MarketId>();
      for (const c of cards) {
        const [resolved, voided] = await Promise.all([read<boolean>(venue.lens, engineLensAbi, "isResolved", [c]), read<boolean>(venue.lens, engineLensAbi, "isVoided", [c])]);
        if (resolved || voided) settleable.add(c);
      }
      for (const action of decideMatch({ match, params, cards, settleable, nowSec })) notes.push(`${await send(action)} (${action.why})`);
    }
    return {
      why: `${ids.length} live · ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ") || "nothing sent yet"}${notes.length ? ` | ${notes.join(" | ")}` : ""}${dryRun ? " · DRY RUN" : ""}`,
      detail: { arena, live: ids.length, counts: { ...counts }, recent },
    };
  };

  return runActor({ name: "duel-settler", log: deps.log, dryRun, everyMs: duelSettlerRefreshMs(), pass });
}
