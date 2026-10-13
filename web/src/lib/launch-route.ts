// `/launch/<x>` that can't be a launch (R6 money, S02 + T16; D-230), decided in the proxy with no I/O so it answers a real
// HTTP 404: anything that isn't an address, or an address outside the TIP-20 factory's range — every launch is a
// TIP-20 the factory made, at `0x20c0` + 20 hex zeros + 8 bytes not in the reserved low range (`TIP20_PREFIX`,
// `predictTokenAddress`). The proxy rewrites those to `/launch/void`, whose page is a 404 with the VOID ticket; an
// address in range that has no launch is the token page's own not-found (and its client VOID). Pure.
const TIP20_PREFIX = "0x20c000000000000000000000";
const RESERVED_LOW = 1000n;
const PAGES = new Set(["meme", "stablecoin", "void"]);

/** True for a `/launch/<segment>` path whose segment can't be a launch. */
export function isLaunchVoid(pathname: string): boolean {
  const m = /^\/launch\/([^/]+)\/?$/.exec(pathname);
  if (!m) return false;
  const seg = decodeURIComponent(m[1]!);
  if (PAGES.has(seg)) return false;
  if (!/^0x[0-9a-fA-F]{40}$/.test(seg)) return true;
  const lower = seg.toLowerCase();
  return !lower.startsWith(TIP20_PREFIX) || BigInt(`0x${lower.slice(TIP20_PREFIX.length)}`) < RESERVED_LOW;
}
