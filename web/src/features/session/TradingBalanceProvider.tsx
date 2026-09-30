"use client";
/**
 * Tap-trading from the Trading Balance, app-wide (S7; D38a): the eager half. It derives the one view every surface
 * reads (`deriveStatus`) from what the lazy runtime publishes, re-deriving on reads and exactly once at the grant's
 * expiry — never on a clock tick (E.5 S7: memoised split context, no 1 s re-render). While the session key is armed,
 * the ticket's `vault-grant` calls route to it (`routeTaps`); a confirmed tap is booked into the view at once
 * ("Spent today" optimistic) and the next read confirms it.
 */
import type { Address, Reading, VaultSnapshot } from "@cwf/core";
import { keys, useSubmitter } from "@cwf/markets/react";
import dynamic from "next/dynamic";
import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { nowMs as clockNow } from "@/lib/clock";
import { useWalletSession } from "@/lib/wallet-session";
import { useDataLayer } from "@/providers/data/context";
import { routeTaps, TapSubmitterContext } from "@/providers/wallet/tap-session";
import { NO_ACTIONS, SessionActionsContext, SessionSubmitterContext, SessionViewContext, type SessionActions } from "./context";
import type { RuntimeState } from "./TradingBalanceRuntime";
import { deriveStatus, type SessionView } from "./view";

const TradingBalanceRuntime = dynamic(() => import("./TradingBalanceRuntime"), { ssr: false });

const IDLE: RuntimeState = { snapshot: undefined, keyLoaded: false, keyAddress: null, submitter: null, ensureKey: NO_ACTIONS.ensureKey, freshKey: NO_ACTIONS.freshKey, forgetKey: NO_ACTIONS.forgetKey };
const MAX_TIMEOUT_MS = 2_147_000_000;

export function TradingBalanceProvider({ children }: { children: ReactNode }) {
  const session = useWalletSession();
  // A signer that batches and can ask for sponsorship (passkey, Tempo Wallet): intake is one batched transaction and
  // taps are sponsored. An injected wallet signs each call itself (X8) and is never offered this.
  const passkey = session.caps?.batch === true && session.caps.sponsor === true;
  const owner: Address | null = session.address;
  const { client } = useDataLayer();
  const [runtime, setRuntime] = useState<RuntimeState>(IDLE);
  const [expiryFlip, setExpiryFlip] = useState(0);
  useEffect(() => setRuntime(IDLE), [owner]);

  const grant = runtime.snapshot?.grants.session ?? null;
  // Re-derive once when the grant expires (a timer at its expiry, not a ticking clock).
  useEffect(() => {
    if (!grant || grant.revoked) return;
    const ms = grant.expiresAtSec * 1000 - clockNow() + 1_000;
    if (ms <= 0) return;
    const t = setTimeout(() => setExpiryFlip((n) => n + 1), Math.min(ms, MAX_TIMEOUT_MS));
    return () => clearTimeout(t);
  }, [grant]);

  const view = useMemo<SessionView>(() => {
    const snapshot = owner && passkey ? runtime.snapshot : undefined;
    const status = deriveStatus({ owner, passkey, snapshot, keyLoaded: runtime.keyLoaded, keyAddress: runtime.keyAddress, nowSec: Math.floor(clockNow() / 1000) });
    return {
      status,
      owner,
      keyAddress: runtime.keyAddress,
      grant: snapshot?.grants.session ?? null,
      availableBase: snapshot ? snapshot.account.availableBase : null,
      deployed: snapshot !== null,
    };
    // expiryFlip: the one time-driven re-derivation.
  }, [owner, passkey, runtime.snapshot, runtime.keyLoaded, runtime.keyAddress, expiryFlip]); // eslint-disable-line react-hooks/exhaustive-deps

  const bookTap = useCallback(
    (costBase: bigint) => {
      if (!client || !owner) return;
      client.setQueryData<Reading<VaultSnapshot | null>>(keys.vault(owner), (prev) => {
        if (!prev?.ok || !prev.value?.grants.session) return prev;
        const g = prev.value.grants.session;
        const today = Math.floor(clockNow() / 86_400_000);
        const spent = (g.spentDay === today ? g.spentTodayBase : 0n) + costBase;
        const session = { ...g, spentDay: today, spentTodayBase: spent, budgetBase: g.budgetBase > costBase ? g.budgetBase - costBase : 0n };
        return { ...prev, value: { ...prev.value, grants: { ...prev.value.grants, session } } };
      });
    },
    [client, owner],
  );
  const refresh = useCallback(async () => {
    if (client && owner) await Promise.all([client.invalidateQueries({ queryKey: keys.vault(owner) }), client.invalidateQueries({ queryKey: keys.balanceSheet(owner) })]);
  }, [client, owner]);
  const actions = useMemo<SessionActions>(
    () => ({ ensureKey: runtime.ensureKey, freshKey: runtime.freshKey, forgetKey: runtime.forgetKey, refresh, bookTap }),
    [runtime.ensureKey, runtime.freshKey, runtime.forgetKey, refresh, bookTap],
  );

  const outerTap = useContext(TapSubmitterContext);
  const user = useSubmitter();
  const armed = view.status === "armed" && runtime.submitter !== null;
  const routed = useMemo(() => (armed && user && runtime.submitter ? routeTaps(outerTap, user, runtime.submitter, bookTap) : outerTap), [armed, user, runtime.submitter, outerTap, bookTap]);

  return (
    <SessionViewContext.Provider value={view}>
      <SessionActionsContext.Provider value={actions}>
        <SessionSubmitterContext.Provider value={armed ? runtime.submitter : null}>
          <TapSubmitterContext.Provider value={routed}>{children}</TapSubmitterContext.Provider>
          {client && owner && passkey ? <TradingBalanceRuntime owner={owner} publish={setRuntime} /> : null}
        </SessionSubmitterContext.Provider>
      </SessionActionsContext.Provider>
    </SessionViewContext.Provider>
  );
}
