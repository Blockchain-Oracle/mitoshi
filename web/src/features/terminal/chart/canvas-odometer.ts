// Ported from Owarine ecb7565b:web/src/features/terminal/chart/canvas-odometer.ts — unchanged.
/**
 * Rolling digits drawn on a canvas (Tradash's `CanvasOdometer`): every digit position, counted from the right, is a slot
 * that rolls to its new digit — upward when the value rose, downward when it fell — while `$ , . + −` stay still.
 */
import { DIGIT_EASE, DIGIT_SNAP, easeFor, rollFrame, rollTarget } from "./engine";

interface Slot {
  cur: number;
  target: number;
}

const isDigit = (c: string) => c >= "0" && c <= "9";

export class CanvasOdometer {
  private text = "";
  private value = Number.NaN;
  private slots: Slot[] = [];

  /** Sets the shown text; `value` gives the roll direction (rise rolls up). */
  set(text: string, value: number): void {
    if (text === this.text) return;
    const direction: 1 | -1 | 0 = Number.isFinite(this.value) && Number.isFinite(value) ? (value > this.value ? 1 : value < this.value ? -1 : 0) : 0;
    const digits = [...text].reverse();
    const prevDigits = [...this.text].reverse();
    const next: Slot[] = [];
    for (let i = 0; i < digits.length; i++) {
      const c = digits[i]!;
      if (!isDigit(c)) {
        next.push({ cur: 0, target: 0 });
        continue;
      }
      const d = Number(c);
      const old = this.slots[i];
      const prev = prevDigits[i];
      if (!old || prev === undefined || !isDigit(prev)) next.push({ cur: d, target: d });
      else next.push({ cur: old.cur, target: rollTarget(old.target, Number(prev), d, direction) });
    }
    this.slots = next;
    this.text = text;
    this.value = value;
  }

  /** Forgets the roll state (a position opened or closed: the PnL row starts fresh). */
  reset(): void {
    this.text = "";
    this.value = Number.NaN;
    this.slots = [];
  }

  /** Advances every slot by one frame of `dtMs`. */
  step(dtMs: number): void {
    const k = easeFor(DIGIT_EASE, dtMs);
    for (const s of this.slots) {
      const d = s.target - s.cur;
      s.cur = Math.abs(d) < DIGIT_SNAP ? s.target : s.cur + d * k;
    }
  }

  /** The text's width in the current font (monospace digits). */
  measure(ctx: CanvasRenderingContext2D): number {
    return ctx.measureText(this.text).width;
  }

  /**
   * Draws right-aligned at `right`, vertically centred on `y`, clipped to `[clipTop, clipBottom]` so rolling digits
   * vanish at the pill's edge. `pitch` is the roll distance between two digits.
   */
  draw(ctx: CanvasRenderingContext2D, right: number, y: number, pitch: number, clipTop: number, clipBottom: number): void {
    const chars = [...this.text].reverse();
    ctx.save();
    ctx.beginPath();
    ctx.rect(right - this.measure(ctx) - 4, clipTop, this.measure(ctx) + 8, clipBottom - clipTop);
    ctx.clip();
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    let x = right;
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i]!;
      const w = ctx.measureText(c).width;
      if (!isDigit(c)) {
        ctx.fillText(c, x, y);
      } else {
        const { digit, next, frac } = rollFrame(this.slots[i]?.cur ?? Number(c));
        if (frac < 1e-3) ctx.fillText(String(digit), x, y);
        else {
          ctx.fillText(String(digit), x, y - frac * pitch);
          ctx.fillText(String(next), x, y + (1 - frac) * pitch);
        }
      }
      x -= w;
    }
    ctx.restore();
  }
}
