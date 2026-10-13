// Is the site there? (D-227, MOBILE; review fix.) What Try again waits on before it reopens the page: one small request
// to the site's own static association file, with a time limit. The offline screen stays up, saying "Trying…", until
// the site answers, rather than blinking to an empty ground and back when it still can't load.
import { WEB_ORIGIN } from "./config";

/** `up`: the host answered (any status but a gateway error); `down`: it didn't, or answered 502/503/504. */
export type Reach = "up" | "down";

const TIMEOUT_MS = 10_000;
/** Gateway answers from the host during a deploy: the page isn't there. */
export const GATEWAY: ReadonlySet<number> = new Set([502, 503, 504]);

export async function probe(): Promise<Reach> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${WEB_ORIGIN}/.well-known/assetlinks.json`, {
      method: "HEAD",
      headers: { "cache-control": "no-cache" },
      signal: abort.signal,
    });
    return GATEWAY.has(res.status) ? "down" : "up";
  } catch {
    return "down";
  } finally {
    clearTimeout(timer);
  }
}
