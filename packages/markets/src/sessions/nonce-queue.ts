// Ported from Masayume 68f7a09:packages/markets/src/sessions/nonce-queue.ts
/**
 * One signing key, one writer.
 *
 * Two writes racing from the same account collide on the nonce and one of them is lost or
 * replaced — which, on a write that moves money, is not an acceptable failure mode. Every
 * send from a session goes through this queue, so the account has exactly one transaction
 * in flight at a time.
 *
 * A failed task must not stall the queue behind it, so the chain continues regardless of
 * outcome while the caller still receives the original rejection.
 */
export type Enqueue = <T>(task: () => Promise<T>) => Promise<T>;

export function createNonceQueue(): Enqueue {
  let tail: Promise<unknown> = Promise.resolve();

  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    // Swallow only the queue's own copy of the rejection; the caller still gets `run`.
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}
