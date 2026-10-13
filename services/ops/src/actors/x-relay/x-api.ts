// Ported from Masayume 68f7a09^9b077b1:services/ops/src/actors/x-relay/{client,transport}.ts (the X API v2 way in,
// removed there when its relay moved to the account session) — S11 (D-227): signed with the bot account's OAuth 1.0a
// user context (or an app-only bearer for reads), and X's pay-per-use 402 named as the owner action it is. It has no
// image upload, so its replies are the text alone (the text carries every fact the card shows).
import { oauth1Header, type OAuth1Credentials } from "./oauth1";
import { XRateLimitedError, XReadBlockedError, XRefusedError, type Mention, type XTransport } from "./transport";

const API = "https://api.x.com/2";
const TIMEOUT_MS = 10_000;

interface MentionsPayload {
  data?: Array<{ id: string; author_id?: string; text: string; created_at?: string; referenced_tweets?: Array<{ type?: string }> }>;
  includes?: { users?: Array<{ id: string; username?: string }> };
}

export type XApiAuth = { kind: "oauth1"; credentials: OAuth1Credentials } | { kind: "bearer"; token: string };

/** X's own words from an error body (`title`/`detail`/`errors[0].message`), short; never a header or credential. */
async function xWords(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { title?: unknown; detail?: unknown; errors?: Array<{ message?: unknown }> } | null;
  const words = [body?.title, body?.detail, body?.errors?.[0]?.message].find((w) => typeof w === "string");
  return typeof words === "string" ? words.slice(0, 160) : `HTTP ${response.status}`;
}

/** A failed read, classified: credits (402), the app's credentials (401/403), rate (429), or anything else. */
async function readFailure(response: Response): Promise<Error> {
  const words = await xWords(response);
  if (response.status === 402) return new XReadBlockedError("credits", `HTTP 402: ${words}`);
  if (response.status === 401 || response.status === 403) return new XReadBlockedError("session", `HTTP ${response.status}: ${words}`);
  if (response.status === 429) {
    const reset = Number(response.headers.get("x-rate-limit-reset"));
    return new XRateLimitedError(Number.isFinite(reset) && reset > 0 ? reset * 1000 : Date.now() + 60_000);
  }
  return new Error(`X API read failed (HTTP ${response.status}): ${words}`);
}

export function xApiTransport(handle: string, read: XApiAuth, post: OAuth1Credentials | null, fetchFn: typeof fetch = fetch): XTransport {
  const user = handle.replace(/^@/, "");
  let accountId: string | null = null;
  let readyAt = 0;
  const authorization = (method: "GET" | "POST", url: string, query: Record<string, string> = {}) =>
    read.kind === "oauth1" ? oauth1Header(read.credentials, method, url, query) : `Bearer ${read.token}`;
  const get = async (path: string, query: Record<string, string> = {}) => {
    const url = `${API}${path}`;
    const qs = new URLSearchParams(query).toString();
    return fetchFn(qs ? `${url}?${qs}` : url, { headers: { authorization: authorization("GET", url, query) }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  };
  const idOf = async (): Promise<string> => {
    if (accountId) return accountId;
    // User context names the account itself; an app-only bearer looks the handle up.
    const response = read.kind === "oauth1" ? await get("/users/me") : await get(`/users/by/username/${encodeURIComponent(user)}`);
    if (!response.ok) throw await readFailure(response);
    const body = (await response.json()) as { data?: { id?: unknown; username?: unknown } };
    const id = body.data?.id;
    if (typeof id !== "string" || !/^\d+$/.test(id)) throw new Error("X API answered no account id");
    if (typeof body.data?.username === "string" && body.data.username.toLowerCase() !== user.toLowerCase()) {
      throw new XReadBlockedError("session", `the X API user context is @${body.data.username}, not @${user}`);
    }
    accountId = id;
    return id;
  };
  return {
    via: "x-api",
    describe: () => `X API v2 (${read.kind === "oauth1" ? "user context" : "app-only"}) · mentions of @${user}`,
    authenticatedAuthorId: idOf,
    async fetchMentions(sinceId) {
      const id = await idOf();
      const query: Record<string, string> = { max_results: sinceId === null ? "5" : "100", "tweet.fields": "author_id,created_at,text,referenced_tweets", expansions: "author_id", "user.fields": "username" };
      if (sinceId !== null && sinceId !== "0") query.since_id = sinceId;
      const response = await get(`/users/${id}/mentions`, query);
      if (!response.ok) {
        const failure = await readFailure(response);
        if (failure instanceof XRateLimitedError) readyAt = failure.retryAtMs;
        throw failure;
      }
      const payload = (await response.json()) as MentionsPayload;
      const handles = new Map((payload.includes?.users ?? []).map((u) => [u.id, u.username ?? null]));
      return (payload.data ?? [])
        .filter((t) => /^\d+$/.test(t.id) && typeof t.author_id === "string")
        .map((t) => ({ id: t.id, authorId: t.author_id!, handle: handles.get(t.author_id!) ?? null, text: t.text, createdAtMs: t.created_at ? Date.parse(t.created_at) || Date.now() : Date.now(), repost: t.referenced_tweets?.some((r) => r.type === "retweeted") ?? false }) satisfies Mention)
        .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    },
    readyAtMs: () => readyAt,
    reply: post
      ? async (mentionId, text) => {
          const url = `${API}/tweets`;
          const response = await fetchFn(url, {
            method: "POST",
            headers: { authorization: oauth1Header(post, "POST", url), "content-type": "application/json" },
            body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: mentionId } }),
            signal: AbortSignal.timeout(30_000),
          });
          // A 4xx (other than a timeout) is X saying no: nothing was published. A 5xx may have landed — ambiguous.
          if (response.status >= 400 && response.status < 500 && response.status !== 408) throw new XRefusedError(String(response.status), await xWords(response));
          if (!response.ok) throw new Error(`reply answered HTTP ${response.status}`);
          const body = (await response.json().catch(() => null)) as { data?: { id?: unknown } } | null;
          return typeof body?.data?.id === "string" ? body.data.id : null;
        }
      : null,
  };
}
