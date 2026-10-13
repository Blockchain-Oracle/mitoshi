// Ported from Masayume 68f7a09:web/src/lib/docs-url.ts; the guides' host as Owarine 90a91d71:web/src/lib/docs-url.ts
// has it (D-227).
/**
 * "Docs" is the documentation site (`docs-site/`, Fumadocs, served at docs.mitoshi.xyz, D-228); `NEXT_PUBLIC_DOCS_URL`
 * names another host. The app's own short pages stay at `/docs` (S20,
 * L-20: the layout `/privacy` and `/terms` share), reached as "Reference" in More.
 */
export const DOCS_URL = (process.env.NEXT_PUBLIC_DOCS_URL?.trim() || "https://docs.mitoshi.xyz").replace(/\/+$/, "");

/** True when the docs are another site (an absolute URL), so links open them as external. */
export const DOCS_EXTERNAL = /^https?:\/\//.test(DOCS_URL);

/** The app's own short docs. */
export const IN_APP_DOCS = "/docs";

/** Resolve a documentation page beneath the configured site, including any base path. */
export function docsUrl(path = ""): string {
  return path ? `${DOCS_URL}/${path.replace(/^\/+/, "")}` : DOCS_URL;
}
