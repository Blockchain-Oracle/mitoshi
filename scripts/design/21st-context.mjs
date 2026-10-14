/**
 * Generates the local, gitignored `.21st/` design context (for `21st search --context auto` and `21st review`) from the
 * committed sources: docs/design/design.json and packages/tokens/src/tokens.json.
 * `21st init --design-context` alone detects nothing in this monorepo layout, so the context is written here.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const design = JSON.parse(readFileSync(join(root, "docs/design/design.json"), "utf8"));
const tokens = JSON.parse(readFileSync(join(root, "packages/tokens/src/tokens.json"), "utf8"));

const context = {
  version: 1,
  project: { name: "Mitoshi", productType: "trading app (prediction markets + stocks on Tempo)", stack: ["next@16", "react@19", "tailwindcss@4", "@base-ui/react", "motion", "lucide-react", "wagmi@3", "viem"] },
  sources: {
    tokens: ["packages/tokens/src/tokens.json", "web/src/styles/tokens.generated.css", "web/src/styles/tokens.css"],
    components: ["web/src/components"],
    assets: ["web/public"],
    instructions: ["docs/design/design.json", "packages/tokens/src/tokens.json"],
  },
  design: {
    colorMode: "dark-default-with-light",
    colors: { dark: { ...tokens.palette.dark, ...tokens.surfaces.dark }, light: { ...tokens.palette.light, ...tokens.surfaces.light }, shared: tokens.shared },
    typography: { faces: tokens.fonts, scale: tokens.type, figures: "JetBrains Mono, tabular (utility `numbers`)" },
    spacing: tokens.spacing,
    radius: tokens.radius,
    shadows: { receipt: "the app's one drop shadow (--receipt-shadow)" },
    motion: { easing: tokens.easing, library: "motion/react m.* under LazyMotion(domAnimation) + MotionConfig reducedMotion=user; transforms and opacity only" },
    density: "compact",
  },
  components: {
    installed: [],
    preferredPrimitives: ["@base-ui/react (Dialog, Drawer swipeDirection=right, Toast, Tabs, Tooltip, Popover, Menu)", "lucide-react icons", "@number-flow/react for headline figures"],
    patterns: ["CTA names its blocker", "failures say whether money moved", "cream receipt island", "centred modals + right-edge slide-over"],
  },
  constraints: {
    must: design.rules,
    avoid: ["raw hex or px in components (use tokens)", "Radix primitives", "gradients and glass", "recharts, visx, gsap, headlessui, qrcode.react, swr", "mock data"],
  },
  decisions: ["D-009 keep Masayume's look", "D-044 revamp recipe", "D-058 JetBrains Mono figures"],
  evidence: ["docs/design/design.json", "packages/tokens/src/tokens.json"],
  generatedAt: new Date().toISOString(),
};

mkdirSync(join(root, ".21st"), { recursive: true });
writeFileSync(join(root, ".21st/design.json"), `${JSON.stringify(context, null, 2)}\n`);
const markdown = [
  "# Mitoshi design context",
  "",
  "Generated from the committed design.json and token source. Use the tokens in UI code; the values below are reference only.",
  "",
  "## Design rules",
  "",
  ...design.rules.map((rule) => `- ${rule}`),
  "",
  "## Typefaces",
  "",
  ...Object.entries(design.fonts).map(([role, face]) => `- ${role}: ${face}`),
  "",
  "## Theme colors",
  "",
  ...Object.entries(design.themes).flatMap(([theme, values]) => [
    `### ${theme}`,
    "",
    ...Object.entries(values).map(([name, value]) => `- ${name}: ${value}`),
    "",
  ]),
  "## Source files",
  "",
  "- docs/design/design.json",
  "- packages/tokens/src/tokens.json",
  "- web/src/styles/tokens.css",
  "",
].join("\n");
writeFileSync(join(root, ".21st/DESIGN.md"), markdown);
console.log("wrote .21st/design.json and .21st/DESIGN.md from tracked design.json + tokens");
