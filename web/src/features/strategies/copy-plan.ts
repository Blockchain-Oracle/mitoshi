// Ported in role from Agari 03b30ab:web/src/features/strategies/{copy-form,copy-setup}.ts — Agari's copy was two
// transactions (grant, then subscribe) with a saved progress to reconcile between them; on Tempo it is one batch the tx
// lane journals (D-219), so this plans that one batch and names every reason it can't be sent yet.
/**
 * The copy drawer's plan (S9.7, L-53): one pure function from what the chain and the index say to the one transaction
 * a copy is, and the first reason the button is off. The vault keeps one live STRATEGY grant per owner, so:
 *  - a live grant to this strategy's runner whose caps fit this envelope is SHARED (`subscribe(id, 0, …)`; no deposit);
 *  - otherwise a NEW budget is granted, and the wallet's other copies on this runner are CARRIED onto it in the same
 *    transaction (a new grant revokes the old) — the caps then fit every carried envelope; copies on another runner
 *    stop, and the plan names them.
 * Money stays in base units; the fee and any deposit come from the wallet, the budget from the Trading Balance.
 */
import { parseDecimalToBaseUnits, USD_DECIMALS, type SubscriptionMode, type TxIntent, type VaultCaps, type VaultGrant } from "@cwf/core";
import { COPY } from "./copy";
import type { MinePayload, StrategyWire } from "./protocol";

/** A copy budget lasts 30 days, then the runner stops until it is renewed (Agari's term). */
export const COPY_TERM_SEC = 30 * 86_400;

export interface CopyPlanInput {
  strategy: StrategyWire;
  strategies: readonly StrategyWire[];
  mine: MinePayload["subscriptions"];
  /** The wallet's live STRATEGY grant, if any (head-fresh from the vault). */
  grant: VaultGrant | null;
  /** The Trading Balance's available funds; null while it is read. */
  availableBase: bigint | null;
  /** The wallet's own pathUSD; null while it is read. */
  walletBase: bigint | null;
  mode: SubscriptionMode;
  /** "share" uses the live grant; "new" sets a fresh budget. Ignored when sharing is not possible. */
  choice: "share" | "new";
  budgetText: string;
  perTradeText: string;
  nowSec: number;
  busy: boolean;
  signedIn: boolean;
}

export interface CopyPlan {
  route: "share" | "new";
  /** Why the live grant can't be shared, when there is one; null when it can (or there is none). */
  shareBlocked: string | null;
  budgetBase: bigint;
  perTradeBase: bigint;
  /** Moved from the wallet into the Trading Balance first. */
  depositBase: bigint;
  feeBase: bigint;
  /** The new grant's caps: inside this envelope and every carried one. */
  caps: VaultCaps;
  /** Copies re-pointed onto the new grant in the same transaction. */
  carried: { strategyId: string; name: string; mode: SubscriptionMode }[];
  /** Copies on another runner a new grant would stop. */
  stops: string[];
  budgetError: string | null;
  perTradeError: string | null;
  /** The form's Max chips (R4-6): the largest budget this one transaction can fund — the Trading Balance, plus a live
   *  grant's unspent budget a new grant returns first, plus the wallet, less the fee (null while a balance is read) —
   *  and the tightest per-trade ceiling of this envelope and every carried one. */
  maxBudgetBase: bigint | null;
  maxPerTradeBase: bigint;
  blockedBy: string | null;
  intent: TxIntent | null;
}

const parseUsdToBase = (text: string) => parseDecimalToBaseUnits(text, USD_DECIMALS);
const min = (xs: bigint[]) => xs.reduce((a, b) => (b < a ? b : a));
const fits = (g: VaultCaps, e: StrategyWire["envelope"]) =>
  g.maxStakePerTradeBase <= BigInt(e.maxStakePerTradeBase) && g.maxDailySpendBase <= BigInt(e.maxDailySpendBase) && g.maxOpenPositions <= e.maxOpenPositions &&
  (BigInt(e.maxPriceRaw) === 0n || (g.maxPriceRaw !== 0n && g.maxPriceRaw <= BigInt(e.maxPriceRaw)));

/** The widest caps every one of these envelopes allows, at this per-trade size. */
export function capsWithin(envelopes: readonly StrategyWire["envelope"][], perTradeBase: bigint): VaultCaps {
  const prices = envelopes.map((e) => BigInt(e.maxPriceRaw)).filter((p) => p > 0n);
  return {
    maxStakePerTradeBase: perTradeBase,
    maxDailySpendBase: min(envelopes.map((e) => BigInt(e.maxDailySpendBase))),
    maxOpenPositions: Math.min(...envelopes.map((e) => e.maxOpenPositions)),
    maxPriceRaw: prices.length ? min(prices) : 0n,
    market: null,
  };
}

export function planCopy(i: CopyPlanInput): CopyPlan {
  const s = i.strategy;
  const id = BigInt(s.strategyId);
  const feeBase = BigInt(s.feeBase);
  const byId = new Map(i.strategies.map((x) => [x.strategyId, x]));
  const others = i.mine.filter((m) => m.active && m.strategyId !== s.strategyId);
  const sameRunner = others.filter((m) => byId.get(m.strategyId)?.runner.toLowerCase() === s.runner.toLowerCase());
  const live = i.grant && !i.grant.revoked && i.grant.expiresAtSec > i.nowSec ? i.grant : null;
  const liveForRunner = live && live.actor.toLowerCase() === s.runner.toLowerCase() ? live : null;
  const shareBlocked = !live ? null : !liveForRunner ? COPY.plan.otherRunner : !fits(liveForRunner.caps, s.envelope) ? COPY.plan.capsTooWide : null;
  const route: "share" | "new" = liveForRunner && !shareBlocked && i.choice === "share" ? "share" : "new";

  const budgetBase = route === "share" ? (liveForRunner?.budgetBase ?? 0n) : (parseUsdToBase(i.budgetText) ?? 0n);
  const perTradeBase = route === "share" ? (liveForRunner?.caps.maxStakePerTradeBase ?? 0n) : (parseUsdToBase(i.perTradeText) ?? 0n);
  const carried = route === "new" ? sameRunner.map((m) => ({ strategyId: m.strategyId, name: byId.get(m.strategyId)?.name ?? `#${m.strategyId}`, mode: m.mode })) : [];
  const envelopes = [s.envelope, ...carried.map((c) => byId.get(c.strategyId)!.envelope)];
  const caps = route === "share" && liveForRunner ? liveForRunner.caps : capsWithin(envelopes, perTradeBase);
  const stops = route === "new" && live && !liveForRunner ? others.map((m) => byId.get(m.strategyId)?.name ?? `#${m.strategyId}`) : [];
  // A new grant first returns the old one's unspent budget to the Trading Balance (the vault revokes it in the same call).
  const reusable = (i.availableBase ?? 0n) + (route === "new" && live ? live.budgetBase : 0n);
  const depositBase = route === "new" && budgetBase > reusable ? budgetBase - reusable : 0n;
  const maxPerTrade = min(envelopes.map((e) => BigInt(e.maxStakePerTradeBase)));

  let budgetError: string | null = null;
  let perTradeError: string | null = null;
  if (route === "new") {
    if (i.budgetText.trim() !== "" && parseUsdToBase(i.budgetText) === null) budgetError = COPY.form.notANumber;
    else if (i.walletBase !== null && depositBase + feeBase > i.walletBase) budgetError = COPY.form.walletShort(i.walletBase, depositBase + feeBase);
    if (i.perTradeText.trim() !== "" && parseUsdToBase(i.perTradeText) === null) perTradeError = COPY.form.notANumber;
    else if (perTradeBase > maxPerTrade) perTradeError = COPY.form.aboveStrategy(maxPerTrade);
    else if (budgetBase > 0n && perTradeBase > budgetBase) perTradeError = COPY.form.aboveBudget;
  } else if (i.walletBase !== null && feeBase > i.walletBase) budgetError = COPY.form.walletShort(i.walletBase, feeBase);

  const blockedBy =
    !i.signedIn ? COPY.blocked.signIn
    : i.busy ? COPY.blocked.busy
    : !s.active ? COPY.blocked.inactive
    : i.availableBase === null || i.walletBase === null ? COPY.blocked.checking
    : budgetError === COPY.form.notANumber ? budgetError
    : perTradeError === COPY.form.notANumber ? perTradeError
    : route === "new" && budgetBase <= 0n ? COPY.blocked.noBudget
    : route === "new" && perTradeBase <= 0n ? COPY.blocked.noPerTrade
    : (perTradeError ?? budgetError);

  const mode = i.mode;
  const intent: TxIntent | null = blockedBy
    ? null
    : route === "share"
      ? { kind: "strategy-subscribe", strategyId: id, grantId: 0n, mode, maxFeeBase: feeBase }
      : {
          kind: "strategy-copy", strategyId: id, runner: s.runner as `0x${string}`, caps, expiresAtSec: i.nowSec + COPY_TERM_SEC, budgetBase, depositBase, mode, maxFeeBase: feeBase,
          carry: carried.map((c) => ({ strategyId: BigInt(c.strategyId), mode: c.mode })),
        };
  const maxBudgetBase = i.availableBase === null || i.walletBase === null ? null : reusable + i.walletBase - feeBase;
  return { route, shareBlocked, budgetBase, perTradeBase, depositBase, feeBase, caps, carried, stops, budgetError, perTradeError, maxBudgetBase, maxPerTradeBase: maxPerTrade, blockedBy, intent };
}

/**
 * Stopping one copy: when other live copies share its grant, only the consent ends (`unsubscribe`, sponsored) and the
 * grant keeps serving them; when it is the last, the grant is revoked too and its unspent budget returns (one
 * sponsored transaction).
 */
export function stopIntent(strategyId: string, mine: MinePayload["subscriptions"], grant: VaultGrant | null): TxIntent {
  const sub = mine.find((m) => m.strategyId === strategyId);
  const sharing = mine.some((m) => m.active && m.strategyId !== strategyId && grant && m.grantId === grant.grantId.toString());
  if (sharing || !grant || !sub || sub.grantId !== grant.grantId.toString()) return { kind: "strategy-unsubscribe", strategyId: BigInt(strategyId) };
  return { kind: "strategy-stop", strategyId: BigInt(strategyId), grantId: grant.grantId };
}
