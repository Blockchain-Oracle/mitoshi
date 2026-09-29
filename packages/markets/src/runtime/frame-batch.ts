/**
 * Coalesces bursts into one delivery per animation frame (D-040: stream and chain events reach React as one batched
 * `setQueryData` per frame, not one render per message). Falls back to a 16 ms timer where there is no rAF (Node).
 */
export function createFrameBatcher<T>(deliver: (items: T[]) => void, schedule?: (run: () => void) => void) {
  // Structural rAF lookup so packages typechecking without the DOM lib still compile this module.
  const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => unknown }).requestAnimationFrame;
  const next = schedule ?? ((run: () => void) => (raf ? raf.call(globalThis, () => run()) : setTimeout(run, 16)));
  let queue: T[] = [];
  let scheduled = false;
  return {
    push(item: T) {
      queue.push(item);
      if (scheduled) return;
      scheduled = true;
      next(() => {
        scheduled = false;
        const items = queue;
        queue = [];
        if (items.length) deliver(items);
      });
    },
  };
}
