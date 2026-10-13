// OAuth state and PKCE, bound server-side to the browser that started (S11, D-227): the state is one this server issued,
// taken once, from the same browser and caller; the code is exchanged with the verifier whose challenge X saw; the app's
// handoff code opens only with the web view's own verifier.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { beginSignIn, finishSignIn, redeemHandoff, safeReturn } = await import("./sign-in.server");
const { readSession, signSession } = await import("./session.server");
const { s256 } = await import("./oauth.server");

type Row = { bindingHash: string | null; caller: string | null; pkceVerifier: string; appChallenge: string | null; returnPath: string | null };
function memoryStore() {
  const authorize = new Map<string, Row>();
  const native = new Map<string, { appChallenge: string; session: string }>();
  return {
    authorize,
    putAuthorize: async (h: string, row: Row) => void authorize.set(h, row),
    takeAuthorize: async (h: string) => {
      const row = authorize.get(h) ?? null;
      authorize.delete(h);
      return row;
    },
    putNative: async (h: string, appChallenge: string, session: string) => void native.set(h, { appChallenge, session }),
    takeNative: async (h: string) => {
      const row = native.get(h) ?? null;
      native.delete(h);
      return row;
    },
  };
}

const SECRET = "s".repeat(64);
const config = { credentials: { kind: "oauth2" as const, clientId: "client-123", clientSecret: "secret-456" }, redirectUri: "https://mitoshi.xyz/api/x/callback", sessionSecret: SECRET };
const NOW = 1_791_870_000_000;

/** X's token and profile endpoints, as fetch sees them: the code must arrive with the verifier whose challenge X saw. */
function fakeX(expectVerifier: () => string) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/2/oauth2/token")) {
      const body = new URLSearchParams(String(init?.body));
      if (body.get("code_verifier") !== expectVerifier() || body.get("code") !== "the-code") return Response.json({ error: "invalid_grant" }, { status: 400 });
      return Response.json({ access_token: "user-token" });
    }
    if (u.endsWith("/2/users/me")) return Response.json({ data: { id: "1234567890", username: "Caller" } });
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

async function started(store = memoryStore(), caller: string | null = null) {
  const begun = await beginSignIn({ config, store, caller, returnPath: "/trade-from-x", appChallenge: null });
  if (!begun.ok) throw new Error(begun.reason);
  const url = new URL(begun.authorize);
  const state = url.searchParams.get("state")!;
  const row = store.authorize.get(s256(state))!;
  return { store, begun, url, state, row };
}

describe("X sign-in (OAuth 2.0 + PKCE, state server-side)", () => {
  it("sends X the right client, scopes and S256 challenge, and keeps the verifier and binding server-side", async () => {
    const { url, row, begun } = await started();
    expect(url.origin + url.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ response_type: "code", client_id: "client-123", redirect_uri: config.redirectUri, scope: "tweet.read users.read", code_challenge_method: "S256" });
    expect(url.searchParams.get("code_challenge")).toBe(s256(row.pkceVerifier));
    expect(url.searchParams.toString()).not.toContain(row.pkceVerifier);
    expect(row.bindingHash).toBe(s256(begun.ok ? begun.binding! : ""));
  });

  it("finishes once, for the same browser, with the verifier, into a signed session", async () => {
    const { store, state, row, begun } = await started();
    const binding = begun.ok ? begun.binding : null;
    const params = new URLSearchParams({ code: "the-code", state });
    const done = await finishSignIn({ config, store, params, binding, caller: null, nowMs: NOW, fetchFn: fakeX(() => row.pkceVerifier) });
    expect(done.kind).toBe("web");
    if (done.kind !== "web") return;
    expect(readSession(SECRET, done.session, NOW)).toEqual({ authorId: "1234567890", handle: "Caller", t: NOW });
    const again = await finishSignIn({ config, store, params, binding, caller: null, nowMs: NOW, fetchFn: fakeX(() => row.pkceVerifier) });
    expect(again).toMatchObject({ kind: "error", reason: "state" });
  });

  it("refuses another browser, another caller, a forged state and a cancel", async () => {
    const a = await started();
    expect(await finishSignIn({ config, store: a.store, params: new URLSearchParams({ code: "the-code", state: a.state }), binding: "someone-else", caller: null, nowMs: NOW })).toMatchObject({ kind: "error", reason: "state" });
    const b = await started(memoryStore(), "0x1111111111111111111111111111111111111111");
    const bBinding = b.begun.ok ? b.begun.binding : null;
    expect(await finishSignIn({ config, store: b.store, params: new URLSearchParams({ code: "the-code", state: b.state }), binding: bBinding, caller: "0x2222222222222222222222222222222222222222", nowMs: NOW })).toMatchObject({ kind: "error", reason: "state" });
    const c = await started();
    expect(await finishSignIn({ config, store: c.store, params: new URLSearchParams({ code: "the-code", state: "forged" }), binding: null, caller: null, nowMs: NOW })).toMatchObject({ kind: "error", reason: "state" });
    const d = await started();
    expect(await finishSignIn({ config, store: d.store, params: new URLSearchParams({ error: "access_denied", state: d.state }), binding: d.begun.ok ? d.begun.binding : null, caller: null, nowMs: NOW })).toMatchObject({ kind: "error", reason: "denied" });
  });

  it("names X's own refusal of the code", async () => {
    const { store, state, begun } = await started();
    const done = await finishSignIn({ config, store, params: new URLSearchParams({ code: "wrong", state }), binding: begun.ok ? begun.binding : null, caller: null, nowMs: NOW, fetchFn: fakeX(() => "x") });
    expect(done).toMatchObject({ kind: "error", reason: "token_invalid_grant" });
  });

  it("hands the app a one-time code that opens only with the web view's verifier", async () => {
    const store = memoryStore();
    const appVerifier = "v".repeat(43);
    // Signed in inside the app's web view; X's callback lands in the system browser, which holds no Mitoshi session.
    const begun = await beginSignIn({ config, store, caller: "0x1111111111111111111111111111111111111111", returnPath: "/trade-from-x", appChallenge: s256(appVerifier) });
    if (!begun.ok) throw new Error(begun.reason);
    expect(begun.binding).toBeNull();
    const state = new URL(begun.authorize).searchParams.get("state")!;
    const row = store.authorize.get(s256(state))!;
    const done = await finishSignIn({ config, store, params: new URLSearchParams({ code: "the-code", state }), binding: null, caller: null, nowMs: NOW, fetchFn: fakeX(() => row.pkceVerifier) });
    if (done.kind !== "app") throw new Error(done.kind);
    expect(await redeemHandoff(store, done.code, "w".repeat(43))).toBeNull();
    expect(await redeemHandoff(store, done.code, appVerifier)).toBeNull();
    const second = await finishSignIn({ config, store, params: new URLSearchParams({ code: "the-code", state }), binding: null, caller: null, nowMs: NOW });
    expect(second.kind).toBe("error");
  });

  it("redeems the right verifier into the same signed session, once", async () => {
    const store = memoryStore();
    const verifier = "q".repeat(43);
    const session = signSession(SECRET, { authorId: "42", handle: "x", t: NOW });
    await store.putNative(s256("c".repeat(43)), s256(verifier), session);
    expect(await redeemHandoff(store, "c".repeat(43), verifier)).toBe(session);
    expect(await redeemHandoff(store, "c".repeat(43), verifier)).toBeNull();
  });

  it("refuses a forged or expired session and keeps return paths on this site", () => {
    const token = signSession(SECRET, { authorId: "42", handle: "x", t: NOW });
    expect(readSession(SECRET, token, NOW)?.authorId).toBe("42");
    expect(readSession("t".repeat(64), token, NOW)).toBeNull();
    expect(readSession(SECRET, `${token.split(".")[0]}.AAAA`, NOW)).toBeNull();
    expect(readSession(SECRET, token, NOW + 31 * 86_400_000)).toBeNull();
    expect(safeReturn("//evil.com")).toBe("/trade-from-x");
    expect(safeReturn("https://evil.com")).toBe("/trade-from-x");
    expect(safeReturn("/claim")).toBe("/claim");
    expect(safeReturn("/settings/account?tab=x#x")).toBe("/settings/account?tab=x#x");
    // The URL parser drops tabs and newlines: each of these would land on evil.com.
    for (const raw of ["/\t/evil.com", "/\n/evil.com", "/\r/evil.com/x", "/\\evil.com", "/ /evil.com"]) {
      expect(safeReturn(raw)).toBe("/trade-from-x");
      expect(new URL(safeReturn(raw), "https://mitoshi.xyz").host).toBe("mitoshi.xyz");
    }
  });
});
