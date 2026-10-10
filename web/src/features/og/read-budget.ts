// Ported from Agari 4c0278ad:web/src/features/landing/og/read-budget.ts.
/**
 * How long a link preview waits on the index before it renders without the data. A crawler times a card out in a few
 * seconds; a card with no price beats no card.
 */
const READ_BUDGET_MS = 2_500;

/** The work's value, or null when it throws or outlasts the budget. */
export async function withinBudget<T>(work: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), READ_BUDGET_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
