"use client";
// `/themes/[slug]`'s client islands (R6, D-230; D-231) — the page itself renders on the server (`ThemeScreen`); only
// what belongs to the visitor runs here. `FollowRoot` holds whether the signed-in wallet copies this basket (its own
// consents, read once the data layer is up — `FollowWatch`), opens the follow sheet, and re-renders the page from the
// server once a minute; the action (`FollowCta`, in the side card and in the phone's dock strip) reads it. The sheet
// and the watch load only when they are needed. The action is the kit pill's grammar on a native button
// (`pill-variants.ts`), so the page carries no button runtime for it. Refero: UGLYCASH's trader profile
// (c4c2bc7d-01a8-4e47-a349-0f667472460b → 408b3f30-9289-48bd-b949-c1960c055bbe): the accent Follow pill becomes a
// quiet grey one once followed — here "Following · Manage" in the kit's ghost tone.
import dynamic from "next/dynamic";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { pillButtonVariants } from "@/components/kit/pill-variants";
import type { StrategyWire } from "@/features/strategies/protocol";
import { useWalletSession } from "@/lib/wallet-session";
import { useDataReady } from "@/providers/data/context";
import { THEMES } from "./copy";
import { useServerRefresh } from "./live";

const FollowSheet = dynamic(() => import("./FollowSheet").then((m) => m.FollowSheet), { ssr: false });
const FollowWatch = dynamic(() => import("./FollowWatch").then((m) => m.FollowWatch), { ssr: false });

interface FollowState {
  following: boolean;
  open: () => void;
}
const FollowContext = createContext<FollowState>({ following: false, open: () => undefined });

export interface FollowRootProps {
  card: StrategyWire;
  name: string;
  symbols: string[];
  opensIn: string | null;
  openFollow: boolean;
  children: ReactNode;
}

export function FollowRoot({ card, name, symbols, opensIn, openFollow, children }: FollowRootProps) {
  useServerRefresh();
  const ready = useDataReady();
  const who = useWalletSession().address;
  const [followingRead, setFollowing] = useState(false);
  const [sheet, setSheet] = useState(openFollow);
  // The sheet (and the balance reads it makes) mounts on the first open and stays, so it can animate closed.
  const [mounted, setMounted] = useState(openFollow);
  const following = ready && who !== null && followingRead;
  const value = useMemo(() => ({ following, open: () => (setMounted(true), setSheet(true)) }), [following]);
  return (
    <FollowContext.Provider value={value}>
      {children}
      {ready && who ? <FollowWatch who={who} strategyId={card.strategyId} onChange={setFollowing} /> : null}
      {ready && mounted ? <FollowSheet card={card} name={name} symbols={symbols} opensIn={opensIn} open={sheet} onOpenChange={setSheet} /> : null}
    </FollowContext.Provider>
  );
}

const cta = (tone: "accent" | "ghost") => pillButtonVariants({ tone, size: "lg", block: true });

/** Follow; "Following · Manage" once the wallet copies it. A closed market still takes a follow: calls start at the open. */
export function FollowCta() {
  const { following, open } = useContext(FollowContext);
  return following
    ? <button type="button" className={cta("ghost")} onClick={open}>{THEMES.follow.manage}</button>
    : <button type="button" className={cta("accent")} data-primary-action="" onClick={open}>{THEMES.card.follow}</button>;
}
