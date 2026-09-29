/**
 * @cwf/tokens — the one source for Masayume's identity (plan §2.2): `tokens.json` → web CSS variables and Tailwind 4
 * `@theme inline` utilities (`generate.ts` writes `web/src/styles/tokens.generated.css`), and the flat theme the
 * native app's Uniwind reads (SM1). Trading tokens (`--up`, `--down`, `--yes`, `--no`, `--chart-*`) derive from the
 * direction pair and are read at runtime by the charts.
 */
import tokens from "./tokens.json" with { type: "json" };

export type ThemeName = "dark" | "light";
export type Tokens = typeof tokens;
export { tokens };

/** Trading tokens: Up/Yes use the direction profit colour, Down/No the loss colour (never the brand accent). */
export function tradingTokens(theme: ThemeName): Record<string, string> {
  const p = tokens.palette[theme];
  const s = tokens.surfaces[theme];
  return {
    up: p.profit, down: p.loss, yes: p.profit, no: p.loss,
    "chart-up": p.profit, "chart-down": p.loss, "chart-line": p.vermilion, "chart-grid": s.hairline,
    "chart-text": p["gray-400"], "chart-crosshair": p["gray-500"], "chart-ground": p.bg,
  };
}

/** The flat colour map the native theme uses (SM1 Uniwind), keyed by our semantic names. */
export function nativeTheme(theme: ThemeName): Record<string, string> {
  const p = tokens.palette[theme];
  const s = tokens.surfaces[theme];
  return {
    ground: p.bg, ink: p.white, "ink-secondary": p["gray-400"], "ink-muted": p["gray-500"], "ink-disabled": p["gray-600"],
    accent: p.vermilion, "accent-pressed": p["vermilion-d"], profit: p.profit, loss: p.loss,
    ...s, ...tokens.shared, ...tradingTokens(theme),
  };
}
