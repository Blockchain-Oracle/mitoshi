import { defineConfig } from "vitest/config";

// `*.live.test.ts` talk to Moderato and run only under `test:live` (vitest.live.config.ts).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.live.test.ts", "**/node_modules/**"],
  },
});
