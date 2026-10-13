#!/usr/bin/env bash
# S2.0 size gate: every contract compiled from `src/` must stay at or under 23.5 KB (23,500 B) of runtime code,
# i.e. at least 1 KiB under the EIP-170 limit of 24,576 B (plan §6 S2 gate). Measured on every S2 step.
#
# Usage: contracts/script/check-sizes.sh            # the Tempo profile (D-231 removed the bridge's `evm` profile)
set -euo pipefail
cd "$(dirname "$0")/.."

LIMIT="${SIZE_LIMIT:-23500}"
OUT="out/tempo"

BUILD_LOG="$(mktemp)"
if ! forge build --skip test --skip script >"$BUILD_LOG" 2>&1; then cat "$BUILD_LOG"; rm -f "$BUILD_LOG"; exit 1; fi
rm -f "$BUILD_LOG"

node - "$OUT" "$LIMIT" <<'JS'
const fs = require("node:fs");
const path = require("node:path");
const [outDir, limitArg] = process.argv.slice(2);
const limit = Number(limitArg);
const EIP170 = 24576;
const rows = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith(".json")) {
      const a = JSON.parse(fs.readFileSync(p, "utf8"));
      const target = a.metadata?.settings?.compilationTarget ?? {};
      for (const [file, name] of Object.entries(target)) {
        if (!file.startsWith("src/") || name !== entry.name.replace(/\.json$/, "").split(".")[0]) continue;
        if (!fs.existsSync(file)) continue; // stale artifact of a deleted source
        const code = (a.deployedBytecode?.object ?? "0x").replace(/^0x/, "");
        const size = code.length / 2;
        if (size === 0) continue; // interfaces and abstract contracts
        rows.push({ name, file, size });
      }
    }
  }
};
if (!fs.existsSync(outDir)) {
  console.log(`check-sizes: no build output in ${outDir}`);
  process.exit(0);
}
walk(outDir);
rows.sort((a, b) => b.size - a.size);
let failed = false;
for (const r of rows) {
  const over = r.size > limit;
  failed ||= over;
  console.log(`${over ? "FAIL" : "ok  "} ${String(r.size).padStart(6)} B  margin ${String(EIP170 - r.size).padStart(6)}  ${r.name} (${r.file})`);
}
if (rows.length === 0) console.log("check-sizes: no contracts under src/ yet");
if (failed) {
  console.error(`check-sizes: a contract exceeds ${limit} B of runtime code`);
  process.exit(1);
}
JS
