import { join } from "node:path";

const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    // Production only: drop Yosuku selectors the app never names (plan §3.1, D-071; see the plugin's header).
    // Turbopack evaluates this without import.meta.dirname; builds run from `web/` (`pnpm --filter @cwf/web build`).
    [join(process.cwd(), "postcss", "purge-yosuku.mjs")]: {},
  },
};

export default config;
