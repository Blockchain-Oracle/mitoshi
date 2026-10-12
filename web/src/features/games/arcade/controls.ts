/**
 * The arcade's inputs, as listeners that write into a ref the step reads.
 *
 * Pips has a physical wheel and one big button. Here the ride's wheel is the pointer's height on the
 * screen (drag anywhere; the dot goes where your finger is), the mouse wheel, or the arrow keys held;
 * the hop's button is any press on the screen, or Space. Keys are listened to on the window while a run
 * is live, so nothing has to be focused, and the ones the game uses are kept from scrolling the page.
 */
export interface RideInput {
  /** 0 = floor, 1 = ceiling. */
  target: number;
  /** −1, 0 or +1: an arrow key held, integrated by the step at a fixed rate. */
  held: -1 | 0 | 1;
}

const WHEEL_UNITS_PER_FIELD = 900;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function attachRideControls(el: HTMLElement, input: RideInput): () => void {
  let pointerId: number | null = null;
  const fromPointer = (event: PointerEvent) => {
    const rect = el.getBoundingClientRect();
    if (rect.height === 0) return;
    input.target = clamp01(1 - (event.clientY - rect.top) / rect.height);
  };
  const onDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    pointerId = event.pointerId;
    el.setPointerCapture(event.pointerId);
    fromPointer(event);
    event.preventDefault();
  };
  const onMove = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    fromPointer(event);
  };
  const onUp = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
  };
  const onWheel = (event: WheelEvent) => {
    input.target = clamp01(input.target - event.deltaY / WHEEL_UNITS_PER_FIELD);
    event.preventDefault();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowUp") input.held = 1;
    else if (event.key === "ArrowDown") input.held = -1;
    else return;
    event.preventDefault();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if ((event.key === "ArrowUp" && input.held === 1) || (event.key === "ArrowDown" && input.held === -1)) input.held = 0;
  };

  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
  el.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  return () => {
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
    el.removeEventListener("wheel", onWheel);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    input.held = 0;
  };
}

export function attachFlapControls(el: HTMLElement, onFlap: () => void): () => void {
  const onDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    onFlap();
    event.preventDefault();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== " " && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (!event.repeat) onFlap();
  };
  el.addEventListener("pointerdown", onDown);
  window.addEventListener("keydown", onKeyDown);
  return () => {
    el.removeEventListener("pointerdown", onDown);
    window.removeEventListener("keydown", onKeyDown);
  };
}
