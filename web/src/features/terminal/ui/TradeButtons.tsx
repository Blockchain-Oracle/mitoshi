"use client";
// Ported from Owarine ecb7565b:web/src/features/terminal/ui/TradeButtons.tsx — CSS swap animation (no motion runtime
// on the terminal's critical path), Mitoshi's tokens, and the blocked reason under a button in the CTA's own words.
import { ArrowDown, ArrowUp, ArrowUpRight, LoaderCircle, X } from "lucide-react";
import { TERMINAL } from "../copy";

/**
 * Tradash's two trade buttons. Flat: UP and DOWN with what each pays. In a position on this Window: TRAIL (greyed until
 * the move past break-even beats the trail distance, solid while armed) and CLOSE. A blocked side stays tappable — the
 * tap says why in a toast — but reads dimmed with the reason beneath.
 */
export type TradeButtonsProps =
  | { mode: "flat"; onUp: () => void; onDown: () => void; busy: "up" | "down" | null; upSub: string | null; downSub: string | null; upNote: string | null; downNote: string | null; disabled?: boolean; /** The side already chosen (Parlay mode: this Window's leg). */ picked?: "up" | "down" | null }
  | { mode: "open"; trailActive: boolean; trailEligible: boolean; trailNote: string | null; onTrail: () => void; onClose: () => void; busy: "close" | "trail" | null; lockedText: string | null };

const spin = <LoaderCircle aria-hidden className="tm-spin" />;

export function TradeButtons(props: TradeButtonsProps) {
  if (props.mode === "flat") {
    return (
      <div key="flat" className="tm-buttons tm-swap">
        {(["up", "down"] as const).map((side) => {
          const up = side === "up";
          const note = up ? props.upNote : props.downNote;
          const sub = up ? props.upSub : props.downSub;
          return (
            <div key={side} className="tm-btn-col">
              <button
                type="button"
                className={`tm-btn ${props.picked === side ? (up ? "tm-up-solid" : "tm-down-solid") : up ? "tm-up-soft" : "tm-down-soft"}`}
                aria-pressed={props.picked != null ? props.picked === side : undefined}
                onClick={up ? props.onUp : props.onDown}
                disabled={props.disabled || props.busy !== null}
                aria-disabled={note ? true : undefined}
                aria-describedby={note ? `tm-note-${side}` : undefined}
              >
                {props.busy === side ? spin : up ? <ArrowUp aria-hidden strokeWidth={3} /> : <ArrowDown aria-hidden strokeWidth={3} />}
                <span className="tm-btn-label">
                  <span>{up ? TERMINAL.buttons.up : TERMINAL.buttons.down}</span>
                  {sub ? <span className="tm-btn-sub">{sub}</span> : null}
                </span>
              </button>
              <span id={`tm-note-${side}`} className="tm-btn-note">{note ?? ""}</span>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div key="open" className="tm-buttons tm-swap">
      <div className="tm-btn-col">
        <button
          type="button"
          className={`tm-btn ${props.trailActive ? "tm-up-solid" : "tm-up-soft"}`}
          onClick={props.onTrail}
          aria-pressed={props.trailActive}
          disabled={props.busy !== null || Boolean(props.lockedText) || (!props.trailActive && !props.trailEligible)}
        >
          {props.busy === "trail" ? spin : <ArrowUpRight aria-hidden strokeWidth={3} />}
          {props.trailActive ? TERMINAL.buttons.trailing : TERMINAL.buttons.trail}
        </button>
        <span className="tm-btn-note">{props.lockedText ? "" : (props.trailNote ?? "")}</span>
      </div>
      <div className="tm-btn-col">
        <button type="button" className="tm-btn tm-down-soft" onClick={props.onClose} disabled={props.busy !== null || Boolean(props.lockedText)}>
          {props.busy === "close" ? spin : <X aria-hidden strokeWidth={3} />}
          {TERMINAL.buttons.close}
        </button>
        <span className="tm-btn-note">{props.lockedText ?? ""}</span>
      </div>
    </div>
  );
}

/** Tradash prints 0.1 % as "0.1" and 1 % as "1": one decimal under 1 %, none above. */
export const trailWords = (pct: number): string => (pct * 100).toFixed(pct * 100 < 1 ? 1 : 0);
