/**
 * Software caps on MPP spending (plan C.5.3 "fallback software caps"). The access key's TIP-1011 periodic limit is the
 * hard ceiling on chain; these caps are the process-side rule that refuses an offer before anything is signed: an
 * allowed chain, an allowed currency, a per-request maximum and a per-UTC-day budget per currency. Spend is reserved
 * when an offer is chosen and released if the payment does not complete, so concurrent calls cannot overshoot.
 */
import type { Address } from "viem";
import type { MppIntent, MppOffer } from "./challenges";

export interface MppCaps {
  /** Chains the payer may pay on (4217 mainnet, 42431 Moderato). */
  chainIds: readonly number[];
  /** Per currency (lower-case address): max base units for one request, and per UTC day. */
  currencies: Readonly<Record<string, { perRequestBase: bigint; perDayBase: bigint }>>;
  /** Intents in preference order; an intent not listed is refused. Charge first: it has a per-request receipt (D-033). */
  intents: readonly MppIntent[];
  /** Recipients the payer may pay; omitted = any (services rotate recipients). */
  recipients?: readonly Address[];
}

export type Refusal = { offer: MppOffer; reason: string };

/** Why an offer is refused under the caps, or null when it is allowed (ignoring today's running spend). */
export function refuseOffer(offer: MppOffer, caps: MppCaps): string | null {
  if (offer.method !== "tempo") return `method ${offer.method} is not supported`;
  if (!caps.intents.includes(offer.intent)) return `intent ${offer.intent} is not allowed`;
  if (offer.chainId === null || !caps.chainIds.includes(offer.chainId)) return `chain ${offer.chainId ?? "unspecified"} is not allowed`;
  const cap = caps.currencies[offer.currency.toLowerCase()];
  if (!cap) return `currency ${offer.currency} is not allowed`;
  if (offer.amountBase > cap.perRequestBase) return `amount ${offer.amountBase} exceeds the per-request cap ${cap.perRequestBase}`;
  if (caps.recipients && offer.recipient && !caps.recipients.some((r) => r.toLowerCase() === offer.recipient!.toLowerCase())) {
    return `recipient ${offer.recipient} is not allowed`;
  }
  return null;
}

/** Allowed offers, best first: intent preference, then the cheaper amount, then the server's order. */
export function rankOffers(offers: readonly MppOffer[], caps: MppCaps): { allowed: MppOffer[]; refused: Refusal[] } {
  const allowed: MppOffer[] = [];
  const refused: Refusal[] = [];
  for (const offer of offers) {
    const reason = refuseOffer(offer, caps);
    if (reason) refused.push({ offer, reason });
    else allowed.push(offer);
  }
  const order = (o: MppOffer) => caps.intents.indexOf(o.intent);
  allowed.sort((a, b) => order(a) - order(b) || (a.amountBase < b.amountBase ? -1 : a.amountBase > b.amountBase ? 1 : 0));
  return { allowed, refused };
}

const utcDay = (nowMs: number) => Math.floor(nowMs / 86_400_000);

/** The per-day budget: reserve before paying, settle or release after. In-process; the TIP-1011 limit backs it on chain. */
export class SpendLedger {
  private day = -1;
  private spent = new Map<string, bigint>();

  constructor(
    private readonly caps: MppCaps,
    private readonly now: () => number = Date.now,
  ) {}

  private roll(): void {
    const today = utcDay(this.now());
    if (today !== this.day) {
      this.day = today;
      this.spent.clear();
    }
  }

  spentToday(currency: Address): bigint {
    this.roll();
    return this.spent.get(currency.toLowerCase()) ?? 0n;
  }

  /** Reserves `offer.amountBase` against today's budget; returns a release function, or a refusal reason. */
  reserve(offer: MppOffer): { release: () => void } | { refused: string } {
    this.roll();
    const key = offer.currency.toLowerCase();
    const cap = this.caps.currencies[key];
    if (!cap) return { refused: `currency ${offer.currency} is not allowed` };
    const next = (this.spent.get(key) ?? 0n) + offer.amountBase;
    if (next > cap.perDayBase) return { refused: `daily budget ${cap.perDayBase} for ${offer.currency} would be exceeded (${next})` };
    this.spent.set(key, next);
    const day = this.day;
    let released = false;
    return {
      release: () => {
        if (released || day !== this.day) return;
        released = true;
        this.spent.set(key, (this.spent.get(key) ?? 0n) - offer.amountBase);
      },
    };
  }
}
