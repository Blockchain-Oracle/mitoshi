"use client";
// A theme's follow sheet (S16; R4-11, D-227) in the arm grammar of features/strategies/CopyDrawer.tsx: one sentence, the
// allocation with its caps behind "Adjust", a "What you are signing" disclosure, one passkey prompt. A follow is one
// root transaction `[authorizeKey(the agent's scoped key), follow]` (`theme-follow`, sponsored): the key's address
// comes from ops' theme-agent (`/api/themes/<id>/agent-key`, which files the request and reads the address back — the
// key itself never leaves ops), its daily limits from core's plan at each member's reference price. Unfollow stops
// the agent after a 5 s Undo (the holdings stay in the wallet; `theme-unfollow`, sponsored); "Sell everything" is its
// own action — the follower's root rebalance of every holding into pathUSD at the reference less the theme's slippage.
import { pathUsdDailyLimit, parseDecimalToBaseUnits, tokenDailyLimit, type Address } from "@cwf/core";
import type { ThemeView } from "@cwf/markets/themes";
import { invalidateThemes, useThemeHoldings } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PillButton, SlideOver, SlideOverContent } from "@/components/kit";
import { notify } from "@/lib/toast";
import { signerOfKind as signerOf, TxCta, TxFailureCard, useTxLifecycle } from "@/components/tx";
import { useSocialSession } from "@/features/social/session";
import { useWalletSession } from "@/lib/wallet-session";
import { THEMES } from "./copy";

const F = THEMES.follow;
const KEY_POLL_MS = 3_000;
const KEY_WAIT_MS = 75_000;
const EXPIRY_SEC = 30 * 86_400;
const usd = (text: string) => parseDecimalToBaseUnits(text.trim() || "0", 6) ?? 0n;
const UNDO_MS = 5_000;
const PATH_USD = "0x20C0000000000000000000000000000000000000" as Address;

/** The agent's key address for this follower and theme: filed, then read back until ops issues it (null on time-out). */
async function agentKey(themeId: bigint): Promise<{ keyId: Address | null; message: string | null }> {
  const url = `/api/themes/${themeId}/agent-key`;
  const first = await fetch(url, { method: "POST", credentials: "same-origin" }).catch(() => null);
  const body = first ? ((await first.json().catch(() => ({}))) as { keyId?: Address | null; message?: string }) : {};
  if (!first?.ok) return { keyId: null, message: body.message ?? F.agentPending };
  if (body.keyId) return { keyId: body.keyId, message: null };
  for (const until = Date.now() + KEY_WAIT_MS; Date.now() < until; ) {
    await new Promise((r) => setTimeout(r, KEY_POLL_MS));
    const r = await fetch(url, { credentials: "same-origin", cache: "no-store" }).catch(() => null);
    const j = r?.ok ? ((await r.json().catch(() => ({}))) as { keyId?: Address | null }) : {};
    if (j.keyId) return { keyId: j.keyId, message: null };
  }
  return { keyId: null, message: F.agentPending };
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="th-field">
      <span>{label}</span>
      <span className="th-field-input"><span aria-hidden>$</span><input value={value} inputMode="decimal" onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} className="numbers" /></span>
    </label>
  );
}

export function FollowSheet({ theme, following, open, onOpenChange }: { theme: ThemeView; following: boolean; open: boolean; onOpenChange: (o: boolean) => void }) {
  const session = useWalletSession();
  const social = useSocialSession();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<"idle" | "key">("idle");
  const [why, setWhy] = useState<string | null>(null);
  const tx = useTxLifecycle();
  const [allocation, setAllocation] = useState("100");
  const [perTrade, setPerTrade] = useState("20");
  const [perDay, setPerDay] = useState("50");
  const [adjust, setAdjust] = useState(false);
  const name = theme.spec?.name ?? `#${theme.themeId}`;

  const holdings = useThemeHoldings(session.address, theme.themeId);
  const unfollow = () => {
    const timer = setTimeout(() => void tx.run({ kind: "theme-unfollow", themeId: theme.themeId }).then(async (o) => { if (o?.status === "confirmed") await invalidateThemes(queryClient); }), UNDO_MS);
    notify.item({ id: "theme-unfollow", title: F.unfollowing(UNDO_MS / 1000), timeout: UNDO_MS, action: { label: F.undo, onClick: () => (clearTimeout(timer), notify.item({ id: "theme-unfollow", title: F.undone })) } });
  };
  const prices = new Map(theme.members.map((m) => [m.token.toLowerCase(), m.refPriceE18]));
  const sellLegs = (holdings?.ok ? holdings.value : []).flatMap((h) => {
    const p = prices.get(h.token.toLowerCase());
    if (!p || h.balance <= 0n) return [];
    const value = (h.balance * p) / 10n ** 18n;
    return [{ tokenIn: h.token, tokenOut: PATH_USD, amountIn: h.balance, minAmountOut: (value * BigInt(10_000 - theme.maxSlippageBps)) / 10_000n }];
  });
  const sellAll = async () => {
    const outcome = await tx.run({ kind: "theme-sell-all", themeId: theme.themeId, creatorFeeBps: theme.creatorFeeBps, legs: sellLegs });
    if (outcome?.status === "confirmed") await invalidateThemes(queryClient);
  };
  const follow = async () => {
    setWhy(null);
    const signed = await social.ensure();
    if (!signed.ok) return setWhy(F.signIn);
    setPhase("key");
    const key = await agentKey(theme.themeId);
    setPhase("idle");
    if (!key.keyId) return setWhy(key.message);
    const caps = { expirySec: Math.floor(Date.now() / 1000) + EXPIRY_SEC, allocationUsd: usd(allocation), maxTradeUsd: usd(perTrade), maxDailyUsd: usd(perDay), maxSlippageBps: theme.maxSlippageBps, maxFeeBps: theme.creatorFeeBps, minIntervalSec: theme.minIntervalSec };
    const outcome = await tx.run({
      kind: "theme-follow", themeId: theme.themeId, version: theme.version, caps, keyId: key.keyId, tokens: theme.members.map((m) => m.token),
      tokenDailyLimits: theme.members.map((m) => tokenDailyLimit(caps.maxDailyUsd, m.refPriceE18)), pathUsdDailyLimit: pathUsdDailyLimit(caps.maxDailyUsd, theme.creatorFeeBps),
    });
    if (outcome?.status === "confirmed") await invalidateThemes(queryClient);
  };
  const confirm = () => (session.address ? (following ? unfollow() : void follow()) : session.connectFor(F.signIn));
  const capsBlocker = usd(allocation) <= 0n || usd(perTrade) <= 0n || usd(perDay) < usd(perTrade) ? F.capsBad : null;
  const blocker = !session.address || following ? null : theme.members.length > 5 ? F.tooMany : phase === "key" ? F.preparing : capsBlocker;

  return (
    <SlideOver open={open} onOpenChange={onOpenChange} urlKey="follow">
      <SlideOverContent title={F.title(name)} fields footer={<TxCta state={blocker ? { kind: "blocked", reason: blocker } : tx.state} action={!session.address ? F.signIn : following ? F.unfollow : THEMES.card.follow} signer={signerOf(session.kind)} sponsored onConfirm={confirm} />}>
        <div className="th-follow">
          <p className="type-body text-ink">{following ? F.unfollowLine : F.line}</p>
          {following ? (
            <PillButton tone="ghost" block disabled={sellLegs.length === 0 || tx.state.kind === "signing" || tx.state.kind === "submitted"} onClick={() => void sellAll()}>{sellLegs.length === 0 ? F.nothingToSell : F.sellAll}</PillButton>
          ) : (
            <>
              <Field label={F.allocation} value={allocation} onChange={setAllocation} />
              <button type="button" className="th-adjust" aria-expanded={adjust} onClick={() => setAdjust((a) => !a)}>{F.adjust}</button>
              {adjust ? (
                <div className="th-follow-caps">
                  <Field label={F.perTrade} value={perTrade} onChange={setPerTrade} />
                  <Field label={F.perDay} value={perDay} onChange={setPerDay} />
                </div>
              ) : null}
              <details className="th-signing">
                <summary>{F.signing}</summary>
                <p>{F.signingBody}</p>
              </details>
            </>
          )}
          {why ? <p role="alert" className="type-caption text-warning">{why}</p> : null}
          {tx.state.kind === "failed" ? <TxFailureCard state={tx.state} onRetry={() => tx.dispatch({ type: "reset" })} /> : null}
        </div>
      </SlideOverContent>
    </SlideOver>
  );
}
