import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/core",
      "packages/markets",
      "packages/brain",
      "packages/db",
      "packages/clients",
      "packages/tokens",
      "services/ops",
      "web",
    ],
    passWithNoTests: true,
  },
});
