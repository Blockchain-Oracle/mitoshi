/**
 * The UX gate (plan §2.5) as a script: every route × width (320/390/768/1440) × theme (dark/light), reporting console
 * errors, horizontal overflow, axe violations (wcag2a/aa), tap targets under 44 px, inputs under 16 px, and a
 * screenshot per case. Exit code 1 on any failure.
 *
 *   pnpm --filter @cwf/web ux-gate --base http://localhost:3101 --out <dir> /markets /stocks …
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "@playwright/test";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1]! : fallback;
};
const base = flag("base", "http://localhost:3101");
const out = flag("out", "ux-gate-out");
const widths = flag("widths", "320,390,768,1440").split(",").map(Number);
const themes = flag("themes", "dark,light").split(",");
const routes = args.length ? args : ["/"];

interface Finding {
  route: string;
  width: number;
  theme: string;
  kind: string;
  detail: string;
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const small: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("a[href], button, [role=button], input, select, textarea, [role=tab], [role=menuitem]"))) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === "hidden") continue;
      if (el.closest("[data-inline-link], p")) continue; // inline text links follow WCAG 2.5.8's inline exception
      if (r.height < 44 && r.width < 44) small.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    const inputs = Array.from(document.querySelectorAll<HTMLElement>("input, textarea, select"))
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => `${el.tagName.toLowerCase()}#${el.id} ${getComputedStyle(el).fontSize}`);
    return { overflow, small, inputs };
  });
}

const browser = await chromium.launch();
const findings: Finding[] = [];
mkdirSync(out, { recursive: true });
for (const route of routes) {
  for (const theme of themes) {
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, deviceScaleFactor: 1, colorScheme: theme === "light" ? "light" : "dark" });
      await context.addInitScript((t) => localStorage.setItem("cwf_theme", t), theme);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      const res = await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
      const add = (kind: string, detail: string) => findings.push({ route, width, theme, kind, detail });
      if (!res || res.status() >= 400) add("status", String(res?.status()));
      for (const e of errors) add("console", e.split("\n")[0]!.slice(0, 200));
      const m = await measure(page);
      if (m.overflow > 0) add("overflow", `${m.overflow}px horizontal scroll`);
      for (const s of m.small) add("target", s);
      for (const i of m.inputs) add("input", i);
      if (width === 390) {
        const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        for (const v of axe.violations) add("axe", `${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")} ${n.failureSummary?.split("\n").slice(1, 2).join("") ?? ""}`).join(" | ")}`);
      }
      await page.screenshot({ path: join(out, `${route.replace(/\W+/g, "_") || "root"}-${theme}-${width}.png`), fullPage: true });
      await context.close();
    }
  }
}
await browser.close();
for (const f of findings) console.log(`${f.route} ${f.theme} ${f.width}: [${f.kind}] ${f.detail}`);
console.log(`${routes.length} route(s), ${findings.length} finding(s); screenshots in ${out}`);
process.exitCode = findings.length ? 1 : 0;
