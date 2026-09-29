// Ported from Masayume 68f7a09:scripts/invariants/run.mjs
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { finding, printReport } from "./lib/report.mjs";
import { rules } from "./rules.mjs";
import { codeLines, readText, walkFiles } from "./lib/walk.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

function runPatternRule(rule) {
  const findings = [];
  for (const scope of rule.scopes) {
    for (const { rel, abs } of walkFiles(root, scope, rule.exts, rule.exclude ?? [])) {
      for (const [lineNo, line] of codeLines(readText(abs))) {
        const match = rule.pattern.exec(line);
        if (match) findings.push(finding(rule, `\`${match[0]}\``, `${rel}:${lineNo}`));
      }
    }
  }
  return findings;
}

function runFileRule(rule) {
  const abs = join(root, rule.file);
  if (!existsSync(abs)) {
    return rule.optional ? { skipped: "file not present yet" } : { findings: [finding(rule, "required file is missing", rule.file)] };
  }
  const text = readFileSync(abs, "utf8");
  const findings = [];
  if (rule.mustMatch && !rule.mustMatch.test(text)) findings.push(finding(rule, `expected ${rule.mustMatch}`, rule.file));
  if (rule.mustNotMatch && rule.mustNotMatch.test(text)) findings.push(finding(rule, `forbidden ${rule.mustNotMatch}`, rule.file));
  return { findings };
}

async function runRule(rule) {
  if (rule.check) return { findings: await rule.check(rule, { root }) };
  if (rule.file) return runFileRule(rule);
  return { findings: runPatternRule(rule) };
}

const results = [];
for (const rule of rules) {
  if (only && rule.id !== only) continue;
  try {
    const outcome = await runRule(rule);
    results.push({ rule, findings: outcome.findings ?? [], skipped: outcome.skipped ?? null });
  } catch (error) {
    results.push({ rule, findings: [finding(rule, `rule crashed: ${error instanceof Error ? error.message : String(error)}`)] });
  }
}

process.exitCode = printReport(results) > 0 ? 1 : 0;
