/**
 * The arcade's inputs, as listeners that write into a ref the step reads. Candle Hop's button is any press on the
 * screen, or Space; Line Rider's sled reads its own input (SledCanvas, R4-9). Keys are listened to on the window while a
 * run is live, so nothing has to be focused, and the ones the game uses are kept from scrolling the page.
 */
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
