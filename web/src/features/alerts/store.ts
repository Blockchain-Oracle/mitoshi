// Ported from Agari 03b30ab:web/src/features/alerts/store.ts — Mitoshi's storage key; the bases are a stock's Regular
// price (NYSE session only) and the 24/7 price (crypto, and a stock's 24/7 feed) instead of xStocks' token basis.
import { oneUnit, parseDecimalToBaseUnits } from "@cwf/core";

/**
 * Stored price-alert rules — ported from `reference/yosuku/lib/priceAlerts.ts`.
 *
 * Device-local, as the reference's are: a rule is a target on one asset, kept in localStorage, and marked
 * triggered once the live price crosses it.
 *
 * What changes (social-assistant.md §1.5):
 * - **Cents:** the target is integer cents (`targetCents`), compared as bigint against the oracle-scale price, so a
 *   stock alert at $251.37 fires at $251.37 rather than at a truncated $251.
 * - **Basis:** `regular` rules watch a stock's price inside the NYSE session only; `allDay` rules watch the price at any
 *   hour (crypto, and a stock's 24/7 feed).
 * - **Legacy:** a stored whole-dollar `targetPrice` converts on load through its decimal text, never float math.
 *
 * What is added: a subscription. The reference's store has no listeners, which is fine
 * for a component that reads it on mount, but the evaluator (`AlertsWatcher`) has to learn
 * about a rule the moment the button saves it, without a reload.
 */
const STORAGE_KEY = "mitoshi.priceAlerts";
const CENTS_DP = 2;

export type AlertDirection = "above" | "below";
export type AlertBasis = "regular" | "allDay";

export interface PriceAlert {
  id: string;
  asset: string;
  basis: AlertBasis;
  /** Integer cents, positive and safe. */
  targetCents: number;
  direction: AlertDirection;
  createdAtMs: number;
  triggered: boolean;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Fires after every local write, and on a `storage` event from another tab. */
export function subscribeAlerts(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

/** Typed cents text ("251.37", "1,020") → integer cents, or null for anything that is not a positive amount. */
export function parseTargetCents(text: string): number | null {
  const cents = parseDecimalToBaseUnits(text, CENTS_DP);
  return cents !== null && cents > 0n && cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

/** A target on the price's own scale (`scale` ≥ 2 decimals), for an exact bigint comparison. */
export function centsToRaw(targetCents: number, scale: number): bigint {
  return BigInt(targetCents) * oneUnit(scale - CENTS_DP);
}

function legacyCents(targetPrice: unknown): number | null {
  if (typeof targetPrice !== "number" || !Number.isFinite(targetPrice)) return null;
  return parseTargetCents(String(targetPrice));
}

function toAlert(value: unknown): PriceAlert | null {
  if (!value || typeof value !== "object") return null;
  const a = value as Record<string, unknown>;
  if (typeof a.id !== "string" || typeof a.asset !== "string") return null;
  if ((a.direction !== "above" && a.direction !== "below") || typeof a.createdAtMs !== "number" || typeof a.triggered !== "boolean") return null;
  if (a.basis !== undefined && a.basis !== "regular" && a.basis !== "allDay") return null;
  const targetCents = typeof a.targetCents === "number" && Number.isSafeInteger(a.targetCents) && a.targetCents > 0 ? a.targetCents : legacyCents(a.targetPrice);
  if (targetCents === null) return null;
  return { id: a.id, asset: a.asset, basis: a.basis ?? "regular", targetCents, direction: a.direction, createdAtMs: a.createdAtMs, triggered: a.triggered };
}

export function loadAlerts(): PriceAlert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(toAlert).filter((alert): alert is PriceAlert => alert !== null) : [];
  } catch {
    return [];
  }
}

export function saveAlerts(alerts: PriceAlert[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    // storage unavailable — the rule lives for this render only
  }
  emit();
}

export function addAlert(asset: string, basis: AlertBasis, targetCents: number, direction: AlertDirection): PriceAlert[] {
  const alerts = loadAlerts();
  alerts.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    asset,
    basis,
    targetCents,
    direction,
    createdAtMs: Date.now(),
    triggered: false,
  });
  saveAlerts(alerts);
  return alerts;
}

export function removeAlert(id: string): PriceAlert[] {
  const alerts = loadAlerts().filter((alert) => alert.id !== id);
  saveAlerts(alerts);
  return alerts;
}

/** The assets with a rule still waiting on this basis — what the evaluator watches. */
export function pendingAssets(alerts: PriceAlert[], basis: AlertBasis): string[] {
  return [...new Set(alerts.filter((alert) => !alert.triggered && alert.basis === basis).map((alert) => alert.asset))].sort();
}

/**
 * The reference's rule, kept: `above` fires at or over the target, `below` at or under it — here on one asset and
 * basis, with `priceRaw` on `scale` decimals. Returns the rules that fired and marks them, so one crossing is one
 * notification.
 */
export function checkAlerts(asset: string, basis: AlertBasis, priceRaw: bigint, scale: number): PriceAlert[] {
  const alerts = loadAlerts();
  const triggered: PriceAlert[] = [];
  const updated = alerts.map((alert) => {
    if (alert.triggered || alert.asset !== asset || alert.basis !== basis) return alert;
    const targetRaw = centsToRaw(alert.targetCents, scale);
    const crossed = alert.direction === "above" ? priceRaw >= targetRaw : priceRaw <= targetRaw;
    if (!crossed) return alert;
    triggered.push(alert);
    return { ...alert, triggered: true };
  });
  if (triggered.length > 0) saveAlerts(updated);
  return triggered;
}

