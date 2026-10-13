"use client";
// Ported from Owarine ecb7565b:web/src/features/terminal/ui/TradeButtons.tsx — CSS swap animation (no motion runtime
// on the terminal's critical path), Mitoshi's tokens, and the blocked reason under a button in the CTA's own words.
// R4-0 (D-227): the reference's `why` — while the pair is off, one plain sentence above it — and a reason both sides
// share is that one line too; a side with nothing to say renders no note row.
import { ArrowDown, ArrowUp, ArrowUpRight, Info, LoaderCircle, X } from "lucide-react";
import { CountedText } from "@/features/markets/session/CountedText";
import { TERMINAL } from "../copy";

/**
 * Tradash's two trade buttons. Flat: UP and DOWN with what each pays. In a position on this Window: TRAIL (greyed until
 * the move past break-even beats the trail distance, solid while armed) and CLOSE. A blocked side stays tappable — the
 * tap says why in a toast — but reads dimmed with the reason beneath.
 */
export type TradeButtonsProps =
  | { mode: "flat"; onUp: () => void; onDown: () => void; busy: "up" | "down" | null; upSub: string | null; downSub: string | null; upNote: string | null; downNote: string | null; disabled?: boolean; /** The side already chosen (Parlay mode: this Window's leg). */ picked?: "up" | "down" | null; /** While the pair is off: why, in one sentence. */ why?: string | null }
  | { mode: "open"; trailActive: boolean; trailEligible: boolean; trailNote: string | null; onTrail: () => void; onClose: () => void; busy: "close" | "trail" | null; lockedText: string | null };

const spin = <LoaderCircle aria-hidden className="tm-spin" />;

export function TradeButtons(props: TradeButtonsProps) {
  if (props.mode === "flat") {
    const shared = props.why ?? (props.upNote !== null && props.upNote === props.downNote ? props.upNote : null);
    return (
      <div key="flat" className="tm-buttons tm-swap">
        {shared ? (
          <p id="tm-note-both" role="status" className="tm-why">
            <Info aria-hidden />
            {/* The wait's count ticks every second; the live region announces the words, not each tick (D-230). */}
            <span><CountedText text={shared} /></span>
          </p>
        ) : null}
        {(["up", "down"] as const).map((side) => {
          const up = side === "up";
          const note = up ? props.upNote : props.downNote;
          const noteId = shared ? "tm-note-both" : `tm-note-${side}`;
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
                aria-describedby={note || props.why ? noteId : undefined}
              >
                {props.busy === side ? spin : up ? <ArrowUp aria-hidden strokeWidth={3} /> : <ArrowDown aria-hidden strokeWidth={3} />}
                <span className="tm-btn-label">
                  <span>{up ? TERMINAL.buttons.up : TERMINAL.buttons.down}</span>
                  {sub ? <span className="tm-btn-sub">{sub}</span> : null}
                </span>
              </button>
              {note && !shared ? <span id={noteId} className="tm-btn-note">{note}</span> : null}
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
