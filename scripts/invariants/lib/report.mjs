// Ported from Masayume 68f7a09:scripts/invariants/lib/report.mjs
const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";

export function finding(rule, message, location = null) {
  return { rule: rule.id, severity: rule.severity ?? "error", message, location };
}

export function printReport(results) {
  let errors = 0;
  let warnings = 0;
  for (const { rule, findings, skipped } of results) {
    if (skipped) {
      console.log(`${DIM}○ ${rule.id} — skipped (${skipped})${RESET}`);
      continue;
    }
    if (findings.length === 0) {
      console.log(`${GREEN}✓ ${rule.id}${RESET}`);
      continue;
    }
    const color = rule.severity === "warn" ? YELLOW : RED;
    const mark = rule.severity === "warn" ? "!" : "✗";
    console.log(`${color}${mark} ${rule.id} — ${rule.description}${RESET}`);
    for (const f of findings) {
      const where = f.location ? `  ${f.location}: ` : "  ";
      console.log(`${where}${f.message}`);
      if (rule.severity === "warn") warnings += 1;
      else errors += 1;
    }
  }
  console.log("");
  console.log(`${errors} error(s), ${warnings} warning(s)`);
  return errors;
}
