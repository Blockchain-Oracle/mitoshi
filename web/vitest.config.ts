import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // tsconfig keeps JSX for Next (`preserve`); a `.test.tsx` and the components it imports compile with React's runtime.
  oxc: { jsx: { runtime: "automatic" } },
  test: { include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
});
