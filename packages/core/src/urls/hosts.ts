/**
 * Mitoshi's addresses (D-228): the app at the apex (`mitoshi.xyz`), ops and its stream one label under it
 * (`ops.mitoshi.xyz`, `stream.mitoshi.xyz`), the guides at `docs.mitoshi.xyz`. The names they used to carry — `testnet.`
 * under the apex and each service's `<name>.testnet.` — and `www.` are kept only to send each request to the same path
 * on the current name.
 */
export const MITOSHI_DOMAIN = "mitoshi.xyz";

/**
 * The current name for an old Mitoshi host: the host without its `testnet.` label (`ops.testnet.mitoshi.xyz` →
 * `ops.mitoshi.xyz`), or the apex for `www.`; null for every other host, the current ones included.
 */
export function movedHost(host: string, domain: string = MITOSHI_DOMAIN): string | null {
  const h = host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  if (h === `www.${domain}` || h === `testnet.${domain}`) return domain;
  const old = `.testnet.${domain}`;
  if (!h.endsWith(old)) return null;
  const name = h.slice(0, -old.length);
  return /^[a-z0-9-]+$/.test(name) ? `${name}.${domain}` : null;
}
