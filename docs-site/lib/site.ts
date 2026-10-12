// Ported from Owarine 90a91d71:docs-site/lib/site.ts (D-227) — Mitoshi's origins; the app repository is private, so
// `source` stays null and no guide links into it.
function origin(value: string | undefined, fallback: string) {
  const url = new URL(value || fallback);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Site origins must use HTTP or HTTPS.');
  return url.origin;
}
// Local previews can override these origins; ordinary guide links open the hosted testnet product.
export const site = {
  name: 'Mitoshi',
  docs: origin(process.env.NEXT_PUBLIC_DOCS_URL, 'https://docs.testnet.mitoshi.xyz'),
  app: origin(process.env.NEXT_PUBLIC_APP_URL, 'https://testnet.mitoshi.xyz'),
  explorer: 'https://explore.testnet.tempo.xyz',
  // Public, revision-pinned source notes. Null while the repository is private.
  source: null as string | null,
  // The app commit every page was last checked against (`pnpm check:content` enforces it).
  revision: '9002c8c',
  reviewed: '2026-10-12',
};
export function appUrl(path = '/trade/BTC') { return new URL(path, site.app).toString(); }
export function txUrl(hash: string) { return `${site.explorer}/tx/${hash}`; }
export function addressUrl(address: string) { return `${site.explorer}/address/${address}`; }
export function sourceUrl(path: string): string | null {
  return site.source && site.revision ? `${site.source}/blob/${site.revision}/${path}` : null;
}
