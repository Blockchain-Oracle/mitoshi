// Ported from Owarine 90a91d71:services/ops/src/actors/x-relay/rettiwt.ts on rettiwt-api 7.1.4 (Masayume 52a86fc:
// "7.1.3 no longer reads the X session") — S11 (D-227): a refused or unreadable session is a named read block, and the
// key's shape is checked against the README's format (`auth_token`, `ct0`, `twid`) without ever printing a value. The
// receipt card uploads through the same writer (Owarine's `uploadImage`); an upload never posts.
import { Rettiwt } from "rettiwt-api";
import { createSearchPacer } from "./search-pacer";
import { XRateLimitedError, XReadBlockedError, XRefusedError, type Mention, type XTransport } from "./transport";

const PAGE = 20;
const MAX_PAGES = 50;

/** The HTTP status, X's error codes and message a rettiwt failure carries; never its request, headers or cookies. */
export function xFailure(error: unknown): { status: number | null; codes: string[]; message: string } {
  const e = (error ?? {}) as { status?: unknown; response?: { status?: unknown }; details?: unknown; message?: unknown };
  const status = typeof e.status === "number" ? e.status : typeof e.response?.status === "number" ? e.response.status : null;
  const codes = Array.isArray(e.details) ? e.details.map((d) => (d as { code?: unknown } | null)?.code).filter((c) => typeof c === "number" || typeof c === "string").map(String) : [];
  return { status, codes, message: typeof e.message === "string" ? e.message.slice(0, 160) : "unknown error" };
}

/** X answered and created nothing: an error body on a 200, or a 4xx other than a timeout. */
function isRefusal(error: unknown): boolean {
  const { status } = xFailure(error);
  if (status === 200) return (error as { name?: unknown } | null)?.name === "TWITTER_ERROR";
  return status !== null && status >= 400 && status < 500 && status !== 408;
}

/**
 * The cookie names a key carries — the README's manual method: `btoa("auth_token=…;ct0=…;twid=…;")`. Names only: the
 * values never leave this function.
 */
export function rettiwtKeyCookieNames(apiKey: string): string[] {
  try {
    const text = Buffer.from(apiKey, "base64").toString("ascii");
    return text.split(";").map((part) => part.split("=")[0]!.trim()).filter((name) => /^[A-Za-z0-9_]+$/.test(name));
  } catch {
    return [];
  }
}

/** The README's three cookies, in its order, re-encoded from whatever the key holds (extra cookies dropped). */
export function readmeShapedKey(apiKey: string): string | null {
  const text = Buffer.from(apiKey, "base64").toString("ascii");
  const jar = new Map(text.split(";").map((p) => p.trim()).filter(Boolean).map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)] as const));
  const [auth, ct0, twid] = [jar.get("auth_token"), jar.get("ct0"), jar.get("twid")];
  if (!auth || !ct0 || !twid) return null;
  return Buffer.from(`auth_token=${auth};ct0=${ct0};twid=${twid};`).toString("base64");
}

/** A failure that a person must fix (the session) versus one the next poll may not hit. */
function readError(error: unknown): Error {
  const f = xFailure(error);
  if (f.status === 401 || f.status === 403) return new XReadBlockedError("session", `the account session was refused (HTTP ${f.status}${f.codes.length ? `, X ${f.codes.join(",")}` : ""})`);
  return new Error(`rettiwt read failed${f.status ? ` (HTTP ${f.status})` : ""}: ${f.message}`);
}

/**
 * The relay over the bot account's own session: X's search for `@handle`, newest first, and a reply posted as the
 * account. The key is the account's cookies encoded the README's way, kept as a secret like any other.
 */
export function rettiwtTransport(apiKey: string, handle: string): XTransport {
  const user = handle.replace(/^@/, "");
  const pacer = createSearchPacer();
  const client = new Rettiwt({
    apiKey, timeout: 10_000, maxRetries: 1,
    responseMiddleware: (response) => {
      if (String(response.config?.url ?? "").includes("/SearchTimeline")) pacer.observe(response.headers as Record<string, unknown>, Date.now());
    },
  });
  // A network retry after an accepted POST can create a duplicate public reply.
  const writer = new Rettiwt({ apiKey, timeout: 30_000, maxRetries: 0 });
  return {
    via: "rettiwt",
    describe: () => `rettiwt (the account's session) · mentions of @${user}`,
    async authenticatedAuthorId() {
      let profile;
      try {
        profile = await client.user.details();
      } catch (error) {
        throw readError(error);
      }
      if (!profile || !/^\d+$/.test(profile.id)) throw new XReadBlockedError("session", "the account session answered no profile");
      if (profile.userName?.toLowerCase() !== user.toLowerCase()) throw new XReadBlockedError("session", `the session is @${profile.userName ?? "?"}, not @${user}`);
      return profile.id;
    },
    async fetchMentions(sinceId) {
      const mentions = new Map<string, Mention>();
      const cursors = new Set<string>();
      let cursor: string | undefined;
      for (let i = 0; i < MAX_PAGES; i++) {
        let page;
        try {
          page = await client.tweet.search({ mentions: [user], ...(sinceId !== null ? { sinceId } : {}) }, PAGE, cursor);
        } catch (error) {
          if (xFailure(error).status !== 429) throw readError(error);
          pacer.limited(Date.now());
          throw new XRateLimitedError(pacer.readyAtMs());
        }
        for (const t of page.list) {
          if (!/^\d+$/.test(t.id)) throw new Error("Invalid mention id from X");
          if (!t.tweetBy?.id || (sinceId !== null && BigInt(t.id) <= BigInt(sinceId))) continue;
          mentions.set(t.id, { id: t.id, authorId: t.tweetBy.id, handle: t.tweetBy.userName ?? null, text: t.fullText, createdAtMs: t.createdAt ? Date.parse(t.createdAt) || Date.now() : Date.now(), repost: Boolean(t.retweetedTweet) });
        }
        // The first poll only draws the line; never walk historical instructions.
        if (sinceId === null || page.list.length === 0 || !page.next || page.list.every((t) => BigInt(t.id) <= BigInt(sinceId))) {
          return [...mentions.values()].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
        }
        if (cursors.has(page.next)) throw new Error("X mention pagination repeated a cursor");
        cursors.add(page.next);
        cursor = page.next;
      }
      // A partial read must not advance since_id beyond unseen instructions.
      throw new Error("X mention backlog exceeds the bounded drain; cursor retained");
    },
    readyAtMs: () => pacer.readyAtMs(),
    uploadImage: async (png) => {
      const id = await writer.tweet.upload(Uint8Array.from(png).buffer);
      if (!/^\d+$/.test(id)) throw new Error("X image upload did not return a media id");
      return id;
    },
    reply: async (mentionId, text, mediaId) => {
      if (!/^\d+$/.test(mentionId) || (mediaId && !/^\d+$/.test(mediaId))) throw new Error("Invalid reply identifier");
      if (text.length > 280 || /[^\x20-\x7E\n]/.test(text)) throw new Error("Reply text exceeded its ASCII budget");
      try {
        const id = await writer.tweet.post({ text, replyTo: mentionId, ...(mediaId ? { media: [{ id: mediaId }] } : {}) });
        return typeof id === "string" && id ? id : null;
      } catch (error) {
        if (!isRefusal(error)) throw error;
        const f = xFailure(error);
        throw new XRefusedError(f.codes.join(",") || String(f.status), f.message);
      }
    },
  };
}
