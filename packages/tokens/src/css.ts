/**
 * Renders the web's token stylesheet from `tokens.json` (replaces Masayume 68f7a09 web/src/styles/bridge.css, which
 * held the same values by hand). The Yosuku palette itself stays in the verbatim port (`styles/yosuku/*`); this file
 * adds the semantic names, the trading tokens and the Tailwind 4 theme, all as `@theme inline` so utilities follow
 * `[data-theme]` at runtime.
 */
import { tokens, tradingTokens, type ThemeName } from "./index";

const block = (selector: string, vars: Record<string, string>) =>
  `${selector} {\n${Object.entries(vars).map(([k, v]) => `  --${k}: ${v};`).join("\n")}\n}`;

function themeVars(theme: ThemeName): Record<string, string> {
  const s = tokens.surfaces[theme];
  return {
    "ms-surface-1": s["surface-1"], "ms-surface-2": s["surface-2"], "ms-surface-3": s["surface-3"],
    "ms-hairline": s.hairline, "ms-border-strong": s["border-strong"],
    ...tradingTokens(theme),
    ...accentFill(theme),
    ...shellTokens(theme),
  };
}

/**
 * The shell's surfaces (D-189: roy-chain/Slush structure in Mitoshi's colours — no new hex). The stage's 2 px edge is
 * Slush's ink outline in light (the light ink, `--white` there) and the strong hairline in dark, where a white outline
 * would shout.
 */
export function shellTokens(theme: ThemeName): Record<string, string> {
  return { "stage-edge": theme === "dark" ? tokens.surfaces.dark["border-strong"] : tokens.palette.light.white };
}

/**
 * The accent as a FILL under small text must pass AA (§2.5): dark keeps vermilion with cream-ink on it (Masayume's
 * own `--button-primary-ink`, 4.7:1); light fills with the pressed vermilion under cream (5.6:1) — white on the light
 * vermilion measured 4.2:1. Both are palette values; nothing new is invented.
 */
export function accentFill(theme: ThemeName): Record<string, string> {
  const p = tokens.palette[theme];
  return theme === "dark"
    ? { "accent-fill": p.vermilion, "accent-fill-pressed": p["vermilion-d"], "on-accent": tokens.shared["cream-ink"] }
    : { "accent-fill": p["vermilion-d"], "accent-fill-pressed": p["gray-100"], "on-accent": p["gray-950"] };
}

const SEMANTIC = `@theme inline {
  --color-ground: var(--bg);
  --color-surface-1: var(--ms-surface-1);
  --color-surface-2: var(--ms-surface-2);
  --color-surface-3: var(--ms-surface-3);
  --color-hairline: var(--ms-hairline);
  --color-border-strong: var(--ms-border-strong);
  --color-ink: var(--white);
  --color-ink-secondary: var(--gray-400);
  --color-ink-muted: var(--gray-500);
  --color-ink-disabled: var(--gray-600);
  --color-accent: var(--vermilion);
  --color-accent-hover: color-mix(in srgb, var(--vermilion) 84%, #FFFFFF);
  --color-accent-pressed: var(--vermilion-d);
  --color-accent-dim: color-mix(in srgb, var(--vermilion) 45%, transparent);
  --color-accent-wash: color-mix(in srgb, var(--vermilion) 12%, transparent);
  --color-profit-wash: color-mix(in srgb, var(--profit) 14%, transparent);
  --color-loss-wash: color-mix(in srgb, var(--loss) 14%, transparent);
  --color-accent-fill: var(--accent-fill);
  --color-accent-fill-pressed: var(--accent-fill-pressed);
  --color-on-accent: var(--on-accent);
  --color-up: var(--up);
  --color-down: var(--down);
  --color-yes: var(--yes);
  --color-no: var(--no);
  --color-chart-up: var(--chart-up);
  --color-chart-down: var(--chart-down);
  --color-chart-line: var(--chart-line);
  --color-chart-grid: var(--chart-grid);
  --color-chart-text: var(--chart-text);
  --color-canvas: var(--bg);
  --color-rail: var(--ms-surface-2);
  --color-rail-active: var(--ms-surface-3);
  --color-stage: var(--gray-950);
  --color-stage-edge: var(--stage-edge);
  --font-body: var(--font-inter), "Inter", system-ui, sans-serif;
  --font-data: var(--font-jetbrains), "JetBrains Mono", ui-monospace, monospace;
  --font-stamp: var(--font-noto-serif-jp), "Noto Serif JP", serif;
  --font-heading: var(--font-sora), "Sora", system-ui, sans-serif;
  --color-background: var(--bg);
  --color-foreground: var(--white);
  --color-card: var(--ms-surface-1);
  --color-card-foreground: var(--white);
  --color-popover: var(--ms-surface-3);
  --color-popover-foreground: var(--white);
  --color-primary: var(--vermilion);
  --color-primary-foreground: #FFFFFF;
  --color-secondary: var(--ms-surface-2);
  --color-secondary-foreground: var(--white);
  --color-muted: var(--ms-surface-2);
  --color-muted-foreground: var(--gray-400);
  --color-accent-foreground: #FFFFFF;
  --color-destructive: var(--loss);
  --color-border: var(--ms-hairline);
  --color-input: var(--ms-hairline);
  --color-ring: var(--vermilion);
}`;

function staticTheme(): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(tokens.shared)) lines.push(`  --color-${k}: ${v};`);
  for (const [name, t] of Object.entries(tokens.type)) {
    if (name.startsWith("$")) continue;
    const spec = t as { size: string; lineHeight: string; letterSpacing?: string; weight: string };
    lines.push(`  --text-${name}: ${spec.size};`, `  --text-${name}--line-height: ${spec.lineHeight};`);
    if (spec.letterSpacing) lines.push(`  --text-${name}--letter-spacing: ${spec.letterSpacing};`);
    lines.push(`  --text-${name}--font-weight: ${spec.weight};`);
  }
  for (const [k, v] of Object.entries(tokens.radius)) lines.push(`  --radius-${k}: ${v};`);
  const sp = tokens.spacing;
  lines.push(`  --spacing: ${sp.base};`);
  for (const [k, v] of Object.entries(sp)) if (k !== "base") lines.push(`  --spacing-${k}: ${v};`);
  // The shell's geometry as spacing (w-rail, w-drawer, h-nav-item) and the drawer's easing as `ease-drawer` (D-189).
  for (const [k, v] of Object.entries(tokens.layout)) if (!k.startsWith("$")) lines.push(`  --spacing-${k}: ${v};`);
  lines.push(`  --ease-drawer: ${tokens.easing["ease-drawer"]};`);
  return `@theme {\n${lines.join("\n")}\n}`;
}

/** Motion durations the shell's CSS reads (`var(--duration-drawer-in)`); plain variables, no utilities. */
function durations(): Record<string, string> {
  return Object.fromEntries(Object.entries(tokens.duration).map(([k, v]) => [`duration-${k}`, v]));
}

export function renderTokensCss(): string {
  return [
    "/* Generated by packages/tokens (pnpm --filter @cwf/tokens gen) from tokens.json — do not edit. */",
    block(":root", themeVars("dark")),
    block('[data-theme="light"]', themeVars("light")),
    SEMANTIC,
    staticTheme(),
    "/* Raw aliases shadcn-shaped primitives reference inside color-mix(). */",
    block(":root", { foreground: "var(--white)", secondary: "var(--ms-surface-2)" }),
    block(":root", durations()),
    "",
  ].join("\n\n");
}
