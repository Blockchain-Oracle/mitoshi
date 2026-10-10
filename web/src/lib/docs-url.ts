// Ported from Masayume 68f7a09:web/src/lib/docs-url.ts
/**
 * The documentation lives in the site group at `/docs` (S20, L-20: the docs layout `/privacy` and `/terms` share);
 * `NEXT_PUBLIC_DOCS_URL` can point it at a separate host instead.
 */
export const DOCS_URL = (process.env.NEXT_PUBLIC_DOCS_URL?.trim() || "/docs").replace(/\/+$/, "");

/** True when the docs are another site (an absolute URL), so links open them as external. */
export const DOCS_EXTERNAL = /^https?:\/\//.test(DOCS_URL);

/** Resolve a documentation page beneath the configured site, including any base path. */
export function docsUrl(path = ""): string {
  return path ? `${DOCS_URL}/${path.replace(/^\/+/, "")}` : DOCS_URL;
}
