// Ported from Masayume 68f7a09:web/src/lib/docs-url.ts
/** The documentation is a separate application; set its public URL before building for deployment. */
export const DOCS_URL = (process.env.NEXT_PUBLIC_DOCS_URL?.trim() || "https://docs.mitoshi.xyz").replace(/\/+$/, "");

/** Resolve a documentation page beneath the configured site, including any base path. */
export function docsUrl(path = ""): string {
  return path ? `${DOCS_URL}/${path.replace(/^\/+/, "")}` : DOCS_URL;
}
