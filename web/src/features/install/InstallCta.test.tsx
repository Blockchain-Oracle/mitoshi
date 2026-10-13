// The web card's install as the server paints it (D-230): before the browser answers, the request's own hint decides —
// an iPhone gets Safari's steps behind the accent pill, a computer gets its browser's menu path as text (no button,
// never the accent), and a browser we can't vouch for gets where to go instead.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { INSTALL } from "./copy";
import { InstallCta } from "./InstallCta";

const paint = (hint: Parameters<typeof InstallCta>[0]["hint"], primary = true) => renderToStaticMarkup(<InstallCta primary={primary} hint={hint} />);

describe("InstallCta (server paint)", () => {
  it("gives an iPhone the Add to Home Screen pill, the accent when it leads", () => {
    const html = paint("ios");
    expect(html).toContain(INSTALL.cta.ios);
    expect(html).toContain("kit-pill--accent");
    expect(html).toContain("data-primary-action");
  });

  it("names each browser's own menu path as text, with no button and no accent", () => {
    for (const hint of ["chrome", "edge", "safari", "android"] as const) {
      const html = paint(hint);
      const where = INSTALL.where[hint];
      expect(html).not.toContain("<button");
      expect(html).not.toContain("kit-pill--accent");
      expect(html).not.toContain("data-primary-action");
      expect(html).toContain(`${where.in}:`);
      for (const step of where.path) expect(html).toContain(step.item);
    }
    expect(paint("safari")).toContain("Add to Dock");
    expect(paint("chrome")).toContain("Chrome menu, then Cast, save and share, then Install page as app");
  });

  it("sends a browser we can't vouch for elsewhere, with nothing to press", () => {
    const html = paint("other");
    expect(html).toContain(INSTALL.elsewhere);
    expect(html).not.toContain("<button");
  });
});
