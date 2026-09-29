import type { Page } from "@playwright/test";

/**
 * Wait for a page to be ready. Not `networkidle`: with the ops stream configured the page holds one SSE connection
 * open for its whole life (D-049), so the network is never idle. `load`, then long enough for the idle-loaded islands
 * (menus, More panel, ticker, font stage — `onIdle` fires by 1.5 s at the latest) to mount.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await page.waitForTimeout(1_600);
}
