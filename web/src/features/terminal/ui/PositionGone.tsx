"use client";
// Tradash's position-gone state (§8, M:11823 / M:12166): an Add, Reduce or TP/SL surface whose position closed while it
// was open stays on screen, says "This position is no longer open." and offers Done.
import { tapFeedback } from "@/lib/feedback";
import { TERMINAL } from "../copy";

export function PositionGone({ onDone }: { onDone: () => void }) {
  return (
    <div className="tm-gone">
      <p className="tm-empty" role="status">{TERMINAL.gone.body}</p>
      <button type="button" className="tm-btn tm-btn-cta" onClick={() => (tapFeedback(), onDone())}>{TERMINAL.gone.done}</button>
    </div>
  );
}
