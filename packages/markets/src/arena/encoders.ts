/**
 * A duel's calls → the one tx lane (R4-9, D-227; Masayume 68f7a09:packages/markets/src/games/write.ts's calls, on
 * Mitoshi's batch encoder). Money the caller hands the arena rides one Tempo batch with its exact approval first:
 * `[approve(arena, pot + key budget), createMatch…]`, `[approve(arena, pot + key budget), joinMatch…]`,
 * `[approve(arena, stake), placePick]` — a key's `placePickFor` spends the player's allowance, so it needs none. Entry,
 * picks, a key grant and the reveal are never sponsored (relay/policies/arena.ts); the exits and permissionless cranks
 * (claim, cancel, the refunds, lock, settle, finalize) ask the relay, which decides by that policy. Tempo has no native
 * value, so an agent grant that asks to carry gas is refused rather than silently dropped.
 */
import { encodeFunctionData, zeroAddress, type Hex } from "viem";
import { arenaIntentSpend, type ArenaIntent } from "@cwf/core/games";
import { diagnosis, type TxIntent } from "@cwf/core";
import { gameArenaAbi } from "@cwf/clients/abis/GameArena";
import { TEMPO } from "@cwf/clients";
import { approveCall, type Call } from "../tx/batch";
import type { EncodeContext, EncodeResult } from "../submitter/encoders";
import { arenaOf } from "./deployment";

const call = (to: Hex, functionName: string, args: readonly unknown[]): Call => ({ to, data: encodeFunctionData({ abi: gameArenaAbi, functionName: functionName as never, args: args as never }) });
const outcomeOf = (pick: "up" | "down") => (pick === "up" ? 0 : 1);

function isArenaIntent(intent: TxIntent): intent is ArenaIntent {
  return intent.kind.startsWith("arena-");
}

export function encodeArenaIntent(intent: TxIntent, ctx: EncodeContext): EncodeResult | null {
  if (!isArenaIntent(intent)) return null;
  const d = arenaOf(ctx.chainId);
  if (!d) return { ok: false, diagnosis: diagnosis("not-deployed", `GameArena is not deployed on chain ${ctx.chainId}`) };
  const arena = d.gameArena as Hex;
  const usd = TEMPO.pathUSD as Hex;
  const spend = arenaIntentSpend(intent);
  const funded = (calls: Call[]) => (spend > 0n ? [approveCall(usd, arena, spend), ...calls] : calls);
  const done = (calls: Call[], summary: string, sponsored = false): EncodeResult => ({ ok: true, value: { area: "arena", calls, sponsored, summary } });
  switch (intent.kind) {
    case "arena-create": {
      if (intent.agent && intent.agent.gasWei > 0n) return { ok: false, diagnosis: diagnosis("contract-revert", "Tempo carries no native value: a seat's key pays its own fees") };
      const head = [intent.matchId, intent.challenger, intent.tier, intent.deckHash, intent.deckSize, intent.policyVersion] as const;
      const c = intent.agent ? call(arena, "createMatchWithAgent", [...head, intent.agent.agent, intent.agent.ttlSec]) : call(arena, "createMatch", head);
      return done(funded([c]), `open a duel, pot ${intent.potBase}`);
    }
    case "arena-join": {
      if (intent.agent && intent.agent.gasWei > 0n) return { ok: false, diagnosis: diagnosis("contract-revert", "Tempo carries no native value: a seat's key pays its own fees") };
      const c = intent.agent ? call(arena, "joinMatchWithAgent", [intent.matchId, intent.agent.agent, intent.agent.ttlSec]) : call(arena, "joinMatch", [intent.matchId]);
      return done(funded([c]), `join a duel, pot ${intent.potBase}`);
    }
    case "arena-authorize":
      return done([call(arena, "authorizeAgent", [intent.matchId, intent.agent ?? zeroAddress, intent.ttlSec])], intent.agent ? "name the seat's key" : "revoke the seat's key");
    case "arena-reveal":
      return done([call(arena, "revealDeck", [intent.matchId, intent.serverSeed, intent.clientSeeds, intent.cards])], "open the deck");
    case "arena-pick":
      return done(funded([call(arena, "placePick", [intent.matchId, intent.cardIndex, outcomeOf(intent.pick), intent.stakeBase, intent.minQuantityRaw])]), `pick card ${intent.cardIndex} ${intent.pick}`);
    case "arena-pick-for":
      return done([call(arena, "placePickFor", [intent.player, intent.matchId, intent.cardIndex, outcomeOf(intent.pick), intent.stakeBase, intent.minQuantityRaw])], `pick card ${intent.cardIndex} ${intent.pick} for the seat`);
    case "arena-lock":
      return done([call(arena, "lockPicks", [intent.matchId])], "close the pick window", true);
    case "arena-settle-card":
      return done([call(arena, "settleCard", [intent.matchId, intent.cardIndex])], `settle card ${intent.cardIndex}`, true);
    case "arena-finalize":
      return done([call(arena, "finalize", [intent.matchId])], "award the pot", true);
    case "arena-cancel":
      return done([call(arena, "cancelMatch", [intent.matchId])], "cancel an unjoined duel", true);
    case "arena-refund-unjoined":
      return done([call(arena, "refundUnjoined", [intent.matchId])], "return an unjoined pot", true);
    case "arena-refund-unrevealed":
      return done([call(arena, "refundUnrevealed", [intent.matchId])], "return both pots of an unopened deck", true);
    case "arena-claim":
      return done([call(arena, "claimCredit", [intent.player])], "claim duel credit", true);
    default:
      return null;
  }
}
