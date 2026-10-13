// S11 (D-227): which way in reads the bot's mentions now. Masayume ran one transport chosen by `X_TRANSPORT`; Mitoshi
// has both kinds of credential on file and X refusing each in its own way (pay-per-use with no credits; a session the
// old Rettiwt couldn't read), so the relay tries them in order and says exactly why when none works.
import type { XReadBlock, XReadState } from "@cwf/core";
import type { RelayEnv } from "./env";
import { readmeShapedKey, rettiwtTransport } from "./rettiwt";
import { XRateLimitedError, XReadBlockedError, type XTransport } from "./transport";
import { xApiTransport } from "./x-api";

export interface Reader {
  transport: XTransport | null;
  /** The bot account's id on X (its own replies are not commands). */
  botId: string | null;
  state: XReadState;
}

/** The ways in, in order: the account session (free), then the X API with the bot's user context, then app-only. */
export function candidates(env: RelayEnv): XTransport[] {
  if (!env.handle) return [];
  const out: XTransport[] = [];
  if (env.rettiwtApiKey) {
    out.push(rettiwtTransport(env.rettiwtApiKey, env.handle));
    // A key carrying more cookies than the README's three is tried in the README's exact shape too.
    const shaped = readmeShapedKey(env.rettiwtApiKey);
    if (shaped && shaped !== env.rettiwtApiKey) out.push(rettiwtTransport(shaped, env.handle));
  }
  if (env.oauth1) out.push(xApiTransport(env.handle, { kind: "oauth1", credentials: env.oauth1 }, env.oauth1));
  else if (env.bearerToken) out.push(xApiTransport(env.handle, { kind: "bearer", token: env.bearerToken }, null));
  return out;
}

const blockOf = (error: unknown): XReadBlock => (error instanceof XReadBlockedError ? error.block : error instanceof XRateLimitedError ? "rate-limited" : "error");
const detailOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 200);
/** Which block an owner should hear about first: the one they can fix by paying or re-keying. */
const RANK: Record<XReadBlock, number> = { credits: 0, session: 1, "rate-limited": 2, error: 3, unconfigured: 4 };

/**
 * Tries each way in: the account must answer as the configured handle, and one read of its newest mentions must work.
 * The first that does wins; otherwise the most actionable refusal is reported (`credits` before `session`).
 */
export async function chooseReader(env: RelayEnv, ways: readonly XTransport[] = candidates(env), nowMs = Date.now()): Promise<Reader> {
  if (ways.length === 0) return { transport: null, botId: null, state: { via: "none", ok: false, block: "unconfigured", detail: env.missing.join(", ") || null, checkedAtMs: nowMs } };
  let worst: { via: XTransport["via"]; block: XReadBlock; detail: string } | null = null;
  for (const way of ways) {
    try {
      const botId = await way.authenticatedAuthorId();
      await way.fetchMentions(null);
      return { transport: way, botId, state: { via: way.via, ok: true, block: null, detail: way.describe(), checkedAtMs: nowMs } };
    } catch (error) {
      const block = blockOf(error);
      if (!worst || RANK[block] < RANK[worst.block]) worst = { via: way.via, block, detail: `${way.describe()}: ${detailOf(error)}` };
    }
  }
  return { transport: null, botId: null, state: { via: worst?.via ?? "none", ok: false, block: worst?.block ?? "error", detail: worst?.detail ?? null, checkedAtMs: nowMs } };
}
