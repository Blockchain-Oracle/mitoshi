"use client";
// Ported from Owarine 90a91d71:web/src/features/x/useXStatus.ts — S11 (D-227): the link machine on Mitoshi's account.
// The X session says who is signed in RIGHT HERE; the store says which account an X account routes to; both are needed
// before a mention can spend. Sign-in at the end (D-224): linking asks for the Mitoshi account only when tapped, in the
// action's words, and finishes once the account is there. In the app, X's sign-in runs in the system browser (SM2).
import { xLinkMessage, xUnlinkMessage, type Address } from "@cwf/core";
import { diagnose } from "@cwf/markets/errors";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { openExternal } from "@/lib/open-external";
import { useWalletSession } from "@/lib/wallet-session";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import { webEnv } from "@/lib/env";
import { shortAddress } from "@/providers/wallet/format";
import { TFX, X_REFUSE, xOAuthMessage } from "./copy";
import { X_REASON_PARAM, X_RETURN_PARAM, type XStatus } from "./protocol";

export type XBusy = "" | "start" | "link" | "unlink";

export interface XLink {
  status: XStatus | null;
  /** True until the first answer; a failed read is `unreadable`, never "not configured". */
  loading: boolean;
  unreadable: boolean;
  busy: XBusy;
  error: string;
  ok: string;
  /** Signed in with X here, and this account isn't its route yet (and can be: no other account holds it). */
  needsLink: boolean;
  /** The signed-in X account routes to this account. */
  linkedHere: boolean;
  /**
   * The signed-in X account routes to ANOTHER account: the server refuses to move it (only that account can unlink), so
   * the screens offer signing in as it instead of a link the bind route would always refuse.
   */
  linkedElsewhere: Address | null;
  start: (returnTo: string) => Promise<void>;
  link: () => Promise<void>;
  unlink: () => Promise<void>;
  refresh: () => Promise<void>;
}

const KEY = ["cwf", "x", "status"] as const;
const HANDOFF_KEY = "cwf.x.handoff";
const inApp = () => typeof window !== "undefined" && Boolean((window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView);

async function s256(verifier: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The web view's half of the app handoff: kept until `/native-auth` trades the code for the session. */
export function readHandoff(): { verifier: string; returnTo: string } | null {
  try {
    const raw = localStorage.getItem(HANDOFF_KEY);
    const p = raw ? (JSON.parse(raw) as { verifier?: unknown; returnTo?: unknown }) : null;
    return p && typeof p.verifier === "string" && typeof p.returnTo === "string" ? { verifier: p.verifier, returnTo: p.returnTo } : null;
  } catch {
    return null;
  }
}

export function clearHandoff(): void {
  try {
    localStorage.removeItem(HANDOFF_KEY);
  } catch {
    /* storage blocked */
  }
}

/**
 * The person closed the passkey or wallet prompt (or the browser refused one without a tap — the return from X signs
 * on its own, and Safari wants a gesture: the Link button stays for that).
 */
function promptClosed(cause: unknown): boolean {
  const e = (cause ?? {}) as { name?: unknown; message?: unknown };
  return diagnose(cause).kind === "user-rejected" || /NotAllowedError|reject|denied|cancel/i.test(`${String(e.name ?? "")} ${String(e.message ?? "")}`);
}

async function post(path: string, body: unknown): Promise<{ ok?: boolean; reason?: string; boundAccount?: string; authorize?: string }> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string; boundAccount?: string; authorize?: string };
  return res.ok ? json : { ...json, ok: false };
}

export function useXLink(): XLink {
  const session = useWalletSession();
  const shell = useWalletShell();
  const account = session.address;
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<XBusy>("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const wantsLink = useRef(false);

  const q = useQuery({
    queryKey: [...KEY, account?.toLowerCase() ?? null],
    queryFn: async () => {
      const res = await fetch(`/api/x/status${account ? `?account=${account}` : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`x status ${res.status}`);
      return (await res.json()) as XStatus;
    },
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
  const status = q.data ?? null;
  const refresh = useCallback(async () => void (await queryClient.invalidateQueries({ queryKey: KEY })), [queryClient]);

  const xSession = status?.session ?? null;
  const binding = status?.binding ?? null;
  const ownRoute = binding && xSession && binding.authorId === xSession.authorId ? binding : null;
  const linkedHere = Boolean(account && ownRoute && ownRoute.account.toLowerCase() === account.toLowerCase());
  const linkedElsewhere = account && ownRoute && !linkedHere ? ownRoute.account : null;
  const needsLink = Boolean(xSession && !linkedHere && !linkedElsewhere);

  const start = useCallback(async (returnTo: string) => {
    setError("");
    if (!inApp()) {
      window.location.assign(`/api/x/start?return=${encodeURIComponent(returnTo)}`);
      return;
    }
    setBusy("start");
    try {
      const verifier = randomVerifier();
      localStorage.setItem(HANDOFF_KEY, JSON.stringify({ verifier, returnTo }));
      const answer = await post("/api/x/start", { app: await s256(verifier), return: returnTo });
      if (answer.ok && answer.authorize) openExternal(answer.authorize);
      else setError(xOAuthMessage(answer.reason ?? "server"));
    } catch {
      // Storage blocked or the network down: the line X's own failures use, never the browser's raw text.
      setError(xOAuthMessage("server"));
    } finally {
      setBusy("");
    }
  }, []);

  const sign = useCallback(async (kind: "link" | "unlink") => {
    if (!account || !xSession) return;
    const failed = kind === "link" ? X_REFUSE.linkFailed : X_REFUSE.unlinkFailed;
    setError("");
    setOk("");
    setBusy(kind);
    try {
      const issuedAtMs = Date.now();
      const fields = { network: webEnv.markets.network, authorId: xSession.authorId, account: account as Address, issuedAtMs };
      let signature: `0x${string}`;
      try {
        signature = await shell.signMessage(kind === "link" ? xLinkMessage(fields) : xUnlinkMessage(fields));
      } catch (cause) {
        // A closed passkey or wallet prompt says nothing; any other signer failure is our line, never its raw text.
        if (!promptClosed(cause)) setError(failed);
        return;
      }
      const answer = await post(`/api/x/${kind === "link" ? "bind" : "unlink"}`, { account, issuedAtMs, signature });
      if (!answer.ok) {
        setError(answer.reason === X_REFUSE.linkedElsewhere && answer.boundAccount ? TFX.otherAccount(shortAddress(answer.boundAccount as Address)) : answer.reason || failed);
        return;
      }
      setOk(kind === "unlink" ? TFX.unlinked : "");
      await refresh();
    } catch {
      setError(failed);
    } finally {
      setBusy("");
    }
  }, [account, xSession, shell, refresh]);

  /** Linking asks for the account only now, titled for this link (D-224), and finishes once it's there. */
  const link = useCallback(async () => {
    if (!xSession) return;
    if (!account) {
      wantsLink.current = true;
      session.connectFor(TFX.linkIntent(xSession.handle ?? xSession.authorId));
      return;
    }
    if (needsLink) await sign("link");
  }, [account, xSession, needsLink, session, sign]);
  useEffect(() => {
    if (wantsLink.current && account && xSession && busy === "") {
      wantsLink.current = false;
      if (needsLink) void sign("link");
    }
  }, [account, xSession, needsLink, busy, sign]);

  // Back from X: `?x=1` finishes the link when an account is here; `?x=err` says why in words.
  const bounced = useRef(false);
  useEffect(() => {
    if (bounced.current || q.isLoading) return;
    const params = new URLSearchParams(window.location.search);
    const result = params.get(X_RETURN_PARAM);
    if (!result) return;
    bounced.current = true;
    if (result === "err") setError(xOAuthMessage(params.get(X_REASON_PARAM)));
    else if (needsLink && account) void sign("link");
    params.delete(X_RETURN_PARAM);
    params.delete(X_REASON_PARAM);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`);
  }, [q.isLoading, needsLink, account, sign]);

  return { status, loading: q.isLoading, unreadable: q.isError && !status, busy, error, ok, needsLink, linkedHere, linkedElsewhere, start, link, unlink: () => sign("unlink"), refresh };
}
