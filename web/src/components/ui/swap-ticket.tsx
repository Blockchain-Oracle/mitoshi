"use client";

// From 21st.dev 27122 ssychui/swap-ticket — revamped per D-044 (spike X23): Masayume tokens instead of shadcn vars and
// literals, `m.*` under LazyMotion instead of framer-motion, integer base units instead of float prices, the CTA label
// is the host's blocker (D-045), and the quote carries its age, guard band and minimum received (E.1). The ticket
// never invents a price: the host passes the quote it read, or `null` while it has none.
import { ArrowUpDown, ChevronDown, X } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";

export interface SwapAsset {
  symbol: string;
  name: string;
  /** Token decimals; amounts cross this component as integer base units. */
  decimals: number;
  /** Spendable balance in base units; null while unread. */
  balanceBase: bigint | null;
}

export interface SwapQuote {
  /** What the pay amount buys, in the receive asset's base units. */
  receiveBase: bigint;
  /** The least the trade may deliver (guard/slippage applied), same units. */
  minReceiveBase: bigint;
  /** The reference band the guard allows, in basis points either side. */
  guardBandBps: number;
  quotedAtMs: number;
}

export interface SwapTicketProps {
  assets: readonly SwapAsset[];
  pay: SwapAsset;
  receive: SwapAsset;
  /** The typed pay amount, as the user typed it. */
  amount: string;
  onAmountChange: (next: string) => void;
  onPick: (side: "pay" | "receive", asset: SwapAsset) => void;
  onFlip: () => void;
  quote: SwapQuote | null;
  /** Chain-corrected now, for the quote-age tick. */
  nowMs: number;
  /** What stops the trade, as the CTA's words; null when the CTA is live (D-045: the CTA names its blocker). */
  blocker: string | null;
  ctaLabel: string;
  onSubmit: () => void;
  pending?: boolean;
  className?: string;
}

/** Base units → a plain decimal string, never through a float. */
export function formatUnits(value: bigint, decimals: number, maxFraction = 6): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const unit = 10n ** BigInt(decimals);
  const whole = (abs / unit).toLocaleString("en-US");
  let frac = (abs % unit).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  if (frac === "" && decimals > 0 && abs % unit !== 0n) frac = "0";
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}


function AmountRow(props: {
  label: string;
  asset: SwapAsset;
  value: string;
  onChange?: (v: string) => void;
  onMax?: () => void;
  onPick: () => void;
  inputId: string;
}) {
  const { label, asset, value, onChange, onMax, onPick, inputId } = props;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface-1 p-3">
      <div className="flex items-center justify-between type-caption text-ink-secondary">
        <label htmlFor={inputId}>{label}</label>
        {asset.balanceBase !== null && (
          <span className="flex items-center gap-2 numbers">
            Balance {formatUnits(asset.balanceBase, asset.decimals)}
            {onMax && (
              <button type="button" onClick={onMax} className="min-h-touch px-2 type-caption font-semibold text-ink underline decoration-accent decoration-2 underline-offset-4">
                Max
              </button>
            )}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (/^\d*\.?\d*$/.test(v)) onChange?.(v);
          }}
          readOnly={!onChange}
          placeholder="0"
          inputMode="decimal"
          autoComplete="off"
          className="w-full min-w-0 rounded-sm bg-transparent type-data-lg text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-accent"
        />
        <button
          type="button"
          onClick={onPick}
          aria-haspopup="dialog"
          aria-label={`${label}: ${asset.symbol}. Change asset`}
          className="flex min-h-touch shrink-0 items-center gap-2 rounded-full border border-hairline bg-surface-2 pl-1 pr-3 text-ink"
        >
          <AssetDisc asset={asset.symbol} className="swap-disc" />
          <span className="type-body-strong">{asset.symbol}</span>
          <ChevronDown aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}

function AssetPicker(props: { side: "pay" | "receive"; assets: readonly SwapAsset[]; current: SwapAsset; onPick: (a: SwapAsset) => void; onClose: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => first.current?.focus(), []);
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      role="dialog"
      aria-labelledby={titleId}
      onKeyDown={(e) => e.key === "Escape" && props.onClose()}
      className="absolute inset-0 z-10 flex flex-col rounded-lg border border-hairline bg-surface-1 p-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <span id={titleId} className="type-body-strong text-ink">
          {props.side === "pay" ? "You pay" : "You receive"}
        </span>
        <button type="button" onClick={props.onClose} aria-label="Close" className="grid size-touch place-items-center rounded-md text-ink-secondary">
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <ul className="flex flex-col gap-1 overflow-y-auto">
        {props.assets.map((a, i) => {
          const active = a.symbol === props.current.symbol;
          return (
            <li key={a.symbol}>
              <button
                ref={i === 0 ? first : undefined}
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => props.onPick(a)}
                className={cn("flex min-h-touch w-full items-center gap-3 rounded-md px-2 text-left", active && "bg-surface-2")}
              >
                <AssetDisc asset={a.symbol} className="swap-disc" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="type-body-strong text-ink">{a.symbol}</span>
                  <span className="truncate type-caption text-ink-secondary">{a.name}</span>
                </span>
                {a.balanceBase !== null && <span className="numbers type-caption text-ink-secondary">{formatUnits(a.balanceBase, a.decimals)}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </m.div>
  );
}

/**
 * The composed trade card: pay amount (balance + Max), a flip on the seam, the receive side computed by the host's
 * quote, an in-card asset picker, and a footer with the quote's age, guard band and minimum received. The CTA's label
 * IS the blocker when one exists; otherwise the host's action label.
 */
export function SwapTicket(props: SwapTicketProps) {
  const reduced = useReducedMotion();
  const [picking, setPicking] = useState<"pay" | "receive" | null>(null);
  const payId = useId();
  const receiveId = useId();
  const { pay, receive, quote } = props;
  const ageSec = quote ? Math.max(0, Math.floor((props.nowMs - quote.quotedAtMs) / 1000)) : null;
  const live = props.blocker === null && !props.pending;
  const label = props.pending ? "Confirming…" : (props.blocker ?? props.ctaLabel);

  return (
    <div className={cn("relative flex w-full max-w-sm flex-col gap-2", props.className)}>
      <div className="relative flex flex-col gap-1">
        <AmountRow
          label="You pay"
          asset={pay}
          value={props.amount}
          onChange={props.onAmountChange}
          onMax={pay.balanceBase !== null ? () => props.onAmountChange(formatUnits(pay.balanceBase!, pay.decimals, pay.decimals).replace(/,/g, "")) : undefined}
          onPick={() => setPicking("pay")}
          inputId={payId}
        />
        <button
          type="button"
          onClick={props.onFlip}
          aria-label="Flip pay and receive"
          className="absolute left-1/2 top-1/2 z-1 grid size-touch -translate-x-1/2 -translate-y-1/2 place-items-center rounded-lg border border-hairline bg-surface-2 text-ink"
        >
          <ArrowUpDown aria-hidden className="size-4" />
        </button>
        <AmountRow
          label="You receive"
          asset={receive}
          value={quote ? formatUnits(quote.receiveBase, receive.decimals) : ""}
          onPick={() => setPicking("receive")}
          inputId={receiveId}
        />
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 px-1 type-caption text-ink-secondary" aria-live="polite">
        <dt>Minimum received</dt>
        <dd className="numbers text-right text-ink">{quote ? `${formatUnits(quote.minReceiveBase, receive.decimals)} ${receive.symbol}` : "—"}</dd>
        <dt>Price guard</dt>
        <dd className="numbers text-right">{quote ? `±${(quote.guardBandBps / 100).toFixed(2)}%` : "—"}</dd>
        <dt>Quote</dt>
        <dd className="numbers text-right">{ageSec === null ? "Waiting for a quote" : `${ageSec}s old`}</dd>
      </dl>

      <m.button
        type="button"
        disabled={!live}
        aria-disabled={!live}
        onClick={props.onSubmit}
        whileTap={live && !reduced ? { scale: 0.97 } : undefined}
        className={cn(
          "min-h-touch rounded-md px-4 type-body-strong transition-colors",
          live ? "bg-accent-fill text-on-accent hover:bg-accent-fill-pressed active:bg-accent-fill-pressed" : "cursor-not-allowed bg-surface-2 text-ink-secondary",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <m.span key={label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.12 }} className="block">
            {label}
          </m.span>
        </AnimatePresence>
      </m.button>

      <AnimatePresence>
        {picking && (
          <AssetPicker
            side={picking}
            assets={props.assets}
            current={picking === "pay" ? pay : receive}
            onPick={(a) => {
              props.onPick(picking, a);
              setPicking(null);
            }}
            onClose={() => setPicking(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
