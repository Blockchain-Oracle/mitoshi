import { defineConfig } from "vitest/config";

// `*.live.test.ts` talk to Moderato and run only under `test:live` (vitest.live.config.ts).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.live.test.ts", "**/node_modules/**"],
    // Several suites dynamically import viem/tempo, mppx and the accounts SDK; a cold import takes ~4 s alone and
    // longer while other work runs (seen at load ~40), so the 5 s default timed out without any logic failure.
    testTimeout: 20_000,
  },
});
