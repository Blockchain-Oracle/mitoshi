// The docs live on their own site (D-230): the app's /docs paths land on the matching guide, and the app's list of
// guides is the site's — so neither a redirect nor a link can open a missing page.
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DOCS_URL, docsRedirect, docsUrl, GUIDES, RETIRED_DOCS } from "./docs-url";

const CONTENT = fileURLToPath(new URL("../../../docs-site/content/docs", import.meta.url));

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) return pages(abs);
    return name.endsWith(".mdx") ? [relative(CONTENT, abs).replace(/\.mdx$/, "")] : [];
  });
}

describe("the docs site", () => {
  it("defaults to docs.mitoshi.xyz", () => {
    expect(DOCS_URL).toBe("https://docs.mitoshi.xyz");
    expect(docsUrl()).toBe("https://docs.mitoshi.xyz");
    expect(docsUrl("trading/proof")).toBe("https://docs.mitoshi.xyz/trading/proof");
  });

  it("names only the site's own guides", () => {
    const site = new Set(pages(CONTENT));
    expect(GUIDES.filter((guide) => !site.has(guide))).toEqual([]);
  });
});

describe("docsRedirect", () => {
  it("sends /docs to the site's home", () => {
    expect(docsRedirect("/docs")).toBe(DOCS_URL);
    expect(docsRedirect("/docs/")).toBe(DOCS_URL);
  });

  it("sends each retired page to the guide that covers it", () => {
    expect(docsRedirect("/docs/record")).toBe(`${DOCS_URL}/explore/record`);
    expect(docsRedirect("/docs/contracts")).toBe(`${DOCS_URL}/architecture/deployments`);
    expect(docsRedirect("/docs/testnet/")).toBe(`${DOCS_URL}/help/availability`);
    expect(docsRedirect("/docs/One-Tap")).toBe(`${DOCS_URL}/start/one-tap`);
    for (const [slug, guide] of Object.entries(RETIRED_DOCS)) expect(docsRedirect(`/docs/${slug}`)).toBe(docsUrl(guide));
  });

  it("passes a guide's own path through, and anything else lands on the home, never a 404", () => {
    expect(docsRedirect("/docs/trading/windows")).toBe(`${DOCS_URL}/trading/windows`);
    expect(docsRedirect("/docs/trading")).toBe(DOCS_URL);
    expect(docsRedirect("/docs/nope/nothing")).toBe(DOCS_URL);
    expect(docsRedirect("/docs/constructor")).toBe(DOCS_URL);
    expect(docsRedirect("/docs/__proto__")).toBe(DOCS_URL);
    expect(docsRedirect("/docs/stocks/bridge")).toBe(DOCS_URL);
  });

  it("sends a path with a file's extension to the site's own file, or its home", () => {
    expect(docsRedirect("/docs/llms.txt")).toBe(`${DOCS_URL}/llms.txt`);
    expect(docsRedirect("/docs/llms-full.txt")).toBe(`${DOCS_URL}/llms-full.txt`);
    expect(docsRedirect("/docs/start/install.json")).toBe(DOCS_URL);
    expect(docsRedirect("/docs/x.png")).toBe(DOCS_URL);
  });

  it("leaves every other path alone", () => {
    expect(docsRedirect("/download")).toBeNull();
    expect(docsRedirect("/docsify")).toBeNull();
    expect(docsRedirect("/")).toBeNull();
  });
});
