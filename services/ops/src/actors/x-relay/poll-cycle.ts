// Ported from Owarine 90a91d71:services/ops/src/actors/x-relay/poll-cycle.ts — S11 (D-227): the bot's own posts are
// skipped by author (the relay replies as the bot), and a hold stops before the next mention without moving the cursor.
import type { XReceipt } from "@cwf/core";
import type { Mention } from "./transport";

export interface MentionCycleContext {
  getCursor(): Promise<string | null>;
  setCursor(id: string): Promise<void>;
  fetch(sinceId: string | null): Promise<Mention[]>;
  /** The bot's own posts (its replies) are not commands. */
  isOwnPost(mention: Mention): boolean;
  /** Claims the mention; true for exactly one caller ever. */
  claim(receipt: XReceipt): Promise<boolean>;
  execute(mention: Mention): Promise<XReceipt>;
  receipt(id: string): Promise<XReceipt | null>;
  save(receipt: XReceipt): Promise<void>;
  /** False holds every new mention (an earlier send's fate is still unknown); the cursor stays put. */
  canExecute?: () => Promise<boolean>;
}

/** The claim a mention gets before anything is checked or sent. */
export function initialReceipt(mention: Mention): XReceipt {
  return { mentionId: mention.id, authorId: mention.authorId, handle: mention.handle, wallet: null, grantId: null, marketId: null, side: null, stakeBase: null, status: "submitted", reason: null, txHash: null, instruction: mention.text, atMs: mention.createdAtMs };
}

/**
 * Mentions are handled oldest first; each is claimed (durably, once) before it executes, and the cursor moves past it
 * only after its receipt is stored. The first poll ever only draws the line: earlier mentions are never executed.
 */
export async function pollMentionCycle(ctx: MentionCycleContext): Promise<{ processed: number; held: boolean }> {
  const since = await ctx.getCursor();
  const mentions = await ctx.fetch(since);
  if (since === null) {
    await ctx.setCursor(mentions.at(-1)?.id ?? "0");
    return { processed: 0, held: false };
  }
  let processed = 0;
  for (const mention of mentions) {
    if (ctx.isOwnPost(mention)) {
      await ctx.setCursor(mention.id);
      continue;
    }
    if (ctx.canExecute && !(await ctx.canExecute())) return { processed, held: true };
    if (await ctx.claim(initialReceipt(mention))) {
      let final: XReceipt;
      try {
        final = await ctx.execute(mention);
      } catch {
        const persisted = await ctx.receipt(mention.id);
        if (!persisted) throw new Error("Claimed X receipt could not be read");
        final = { ...persisted, status: "unknown", reason: "Needs checking before another instruction." };
      }
      await ctx.save(final);
      processed += 1;
    }
    await ctx.setCursor(mention.id);
  }
  return { processed, held: false };
}
