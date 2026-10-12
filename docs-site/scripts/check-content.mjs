#!/usr/bin/env node
/**
 * Verify the docs against the app they describe (ported from Owarine 90a91d71:docs-site/scripts/check-content.mjs,
 * D-227). The docs live in the app's repository at docs-site/, so the app is the parent directory
 * (`MITOSHI_SOURCE_DIR` overrides it). Fails on: a pinned revision that is not an ancestor of HEAD, a missing source
 * path, a broken docs link or nav entry, an app route that has no page, a capture whose bytes differ from the app's,
 * an architecture graph out of shape, deployments that differ from the fragments, a transaction hash that no
 * acceptance record or receipt list holds, an address that no fragment or record names, or a previous chain's words.
 * Recorded media (scripts/media-plan.json → pnpm media:record → pnpm media:publish) must match their SHA-256; a guide may
 * name a planned capture or walkthrough before it is recorded, and the check lists those as pending.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.env.MITOSHI_SOURCE_DIR || resolve(root, '..'));
const content = resolve(root, 'content/docs');
const pinned = readFileSync(resolve(root, 'lib/site.ts'), 'utf8').match(/revision:\s*'([0-9a-f]{7,40})'/)?.[1] ?? null;
const appPaths = ['web', 'mobile', 'packages', 'services', 'contracts/src', 'contracts/deployments'];
const graphs = JSON.parse(readFileSync(resolve(root, 'lib/architecture.json'), 'utf8'));
const failures = [];
const warnings = [];
let pages = 0, links = 0, appRoutes = 0, media = 0, hashes = 0, addresses = 0;

const fail = message => failures.push(message);
const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(resolve(dir, e.name)) : [resolve(dir, e.name)]);
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');
function git(...args) {
  try { return execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
}
function docRoute(path) {
  const route = path.split('#')[0].replace(/\/$/, '') || '/';
  return route === '/' ? resolve(content, 'index.mdx') : resolve(content, `${route.slice(1)}.mdx`);
}
/** A folder and every route group `(x)` beneath it, since groups add no URL segment. */
function withGroups(dir) {
  const out = [dir];
  for (const e of readdirSync(dir, { withFileTypes: true })) if (e.isDirectory() && /^\(.+\)$/.test(e.name)) out.push(...withGroups(resolve(dir, e.name)));
  return out;
}
/** An app route exists when each segment matches a folder (literal first, then `[param]`) and the last has a page. */
function appRouteExists(path) {
  let dirs = [resolve(source, 'web/src/app')];
  for (const segment of path.split(/[?#]/)[0].split('/').filter(Boolean)) {
    const next = [];
    for (const dir of dirs.flatMap(withGroups)) {
      if (existsSync(resolve(dir, segment))) next.push(resolve(dir, segment));
      else for (const e of readdirSync(dir, { withFileTypes: true })) if (e.isDirectory() && /^\[[^.\]]+\]$/.test(e.name)) next.push(resolve(dir, e.name));
    }
    if (!next.length) return false;
    dirs = next;
  }
  return dirs.flatMap(withGroups).some(dir => existsSync(resolve(dir, 'page.tsx')));
}

// 1. The pin.
if (!pinned) fail('lib/site.ts has no revision to check against');
else if (!existsSync(resolve(source, 'web/src/app'))) fail(`Mitoshi source missing: ${source}`);
else if (git('cat-file', '-e', `${pinned}^{commit}`) === null) fail(`Pinned revision ${pinned} is not in ${source}'s history`);
else if (git('merge-base', '--is-ancestor', pinned, 'HEAD') === null) fail(`Pinned revision ${pinned} is not an ancestor of HEAD`);
else {
  const since = git('log', '--format=%h %s', `${pinned}..HEAD`, '--', ...appPaths)?.split('\n').filter(Boolean) ?? [];
  if (since.length) warnings.push(`${since.length} app commit(s) since the reviewed revision ${pinned}; review them, update the guides, then advance site.revision:`, ...since.slice(0, 15).map(l => `  ${l.slice(0, 120)}`), ...(since.length > 15 ? [`  … and ${since.length - 15} more`] : []));
}

// 2. The record the guides cite: acceptance runs, the demo's receipts, the deployment fragments, the venue spec.
const recordFiles = [
  ...files(resolve(source, 'docs/plan/acceptance')).filter(p => p.endsWith('.md')),
  resolve(source, 'web/src/features/demo/proofs.ts'),
  resolve(source, 'docs/plan/STATUS.md'),
].filter(existsSync);
const fragmentFiles = files(resolve(source, 'contracts/deployments')).filter(p => p.endsWith('.json'));
const record = [...recordFiles, ...fragmentFiles, resolve(source, 'packages/core/src/market/venue-spec.json'), resolve(source, 'context/tempo/00-network-facts.md')]
  .filter(existsSync).map(p => readFileSync(p, 'utf8')).join('\n').toLowerCase();
const PATH_USD = '0x20c0000000000000000000000000000000000000';

// 3. Pages: links, app routes, captures, graphs, receipts, addresses, words.
const FORBIDDEN = /\b(Canton|Somnia|DreamDEX|Daml|Solana|devnet|tUSDC|demo credits?)\b/;
const captureSource = readFileSync(resolve(root, 'lib/captures.ts'), 'utf8');
const mediaRegistry = JSON.parse(readFileSync(resolve(root, 'lib/media.generated.json'), 'utf8'));
const mediaPlan = JSON.parse(readFileSync(resolve(root, 'scripts/media-plan.json'), 'utf8'));
const shippedNames = new Set([...captureSource.matchAll(/^  ([A-Za-z]\w*): \{/gm)].map(([, n]) => n));
const captureNames = new Set([...shippedNames, ...Object.keys(mediaRegistry.captures)]);
const plannedCaptures = new Set(mediaPlan.captures.map(c => c.name));
const plannedWalkthroughs = new Set(mediaPlan.walkthroughs.map(w => w.name));
const pending = new Set();
for (const path of files(content).filter(p => p.endsWith('.mdx'))) {
  pages++;
  const body = readFileSync(path, 'utf8');
  const label = relative(root, path);
  const sources = body.match(/^sources:\n((?:\s+- .+\n)+)/m)?.[1].split('\n').map(l => l.replace(/^\s+- "?|"?$/g, '')).filter(Boolean) ?? [];
  for (const p of sources) if (!existsSync(resolve(source, p))) fail(`${label}: source path missing ${p}`);
  for (const [, route] of body.matchAll(/\]\((\/[^)\s]+)\)/g)) {
    links++;
    if (route.startsWith('/captures/') || route.startsWith('/diagrams/')) { media++; if (!existsSync(resolve(root, 'public', route.slice(1)))) fail(`${label}: missing media ${route}`); }
    else if (!existsSync(docRoute(route))) fail(`${label}: missing docs page ${route}`);
  }
  for (const [, route] of body.matchAll(/<AppLink\s+href="(\/[^"]*)"/g)) { appRoutes++; if (!appRouteExists(route)) fail(`${label}: missing app route ${route}`); }
  for (const [, name] of body.matchAll(/<GuideCapture\s+name="([^"]+)"/g)) {
    media++;
    if (captureNames.has(name)) continue;
    if (plannedCaptures.has(name)) pending.add(`capture ${name} (${label})`); else fail(`${label}: unknown capture ${name}`);
  }
  for (const [, name] of body.matchAll(/<Walkthrough\s+name="([^"]+)"/g)) {
    media++;
    if (name in mediaRegistry.walkthroughs) continue;
    if (plannedWalkthroughs.has(name)) pending.add(`walkthrough ${name} (${label})`); else fail(`${label}: unknown walkthrough ${name}`);
  }
  for (const [, name] of body.matchAll(/<Architecture\s+name="([^"]+)"/g)) { media++; if (!(name in graphs)) fail(`${label}: unknown architecture ${name}`); }
  for (const [hash] of body.matchAll(/0x[0-9a-fA-F]{64}\b/g)) { hashes++; if (!record.includes(hash.toLowerCase())) fail(`${label}: ${hash} is in no acceptance record, receipt list or fragment`); }
  for (const [address] of body.matchAll(/0x[0-9a-fA-F]{40}\b(?![0-9a-fA-F])/g)) { addresses++; const a = address.toLowerCase(); if (a !== PATH_USD && !record.includes(a)) fail(`${label}: ${address} is in no deployment fragment or record`); }
  const prose = body.replace(/^---[\s\S]*?---/, '');
  const word = prose.match(FORBIDDEN);
  if (word) fail(`${label}: a previous chain's word "${word[0]}"`);
}
for (const path of files(content).filter(p => p.endsWith('meta.json'))) {
  const label = relative(root, path);
  let meta;
  try { meta = JSON.parse(readFileSync(path, 'utf8')); } catch { fail(`${label}: invalid JSON`); continue; }
  for (const page of meta.pages || []) {
    if (page.startsWith('---')) continue;
    const target = resolve(dirname(path), page);
    if (!existsSync(`${target}.mdx`) && !existsSync(resolve(target, 'meta.json'))) fail(`${label}: missing nav entry ${page}`);
  }
}

// 4. Captures: the docs' copy is byte-for-byte the app's own.
const provenance = JSON.parse(readFileSync(resolve(root, 'public/captures/provenance-2026-10-10.json'), 'utf8'));
for (const c of provenance.captures) {
  media++;
  const file = resolve(root, 'public/captures', c.file);
  if (!existsSync(file)) { fail(`Capture ${c.name}: missing ${c.file}`); continue; }
  if (sha256(file) !== c.sha256) fail(`Capture ${c.name}: SHA-256 differs from provenance`);
  const app = resolve(source, c.appPath);
  if (existsSync(app) && sha256(app) !== c.sha256) warnings.push(`Capture ${c.name}: the app's ${c.appPath} has changed since the docs copied it`);
  if (!shippedNames.has(c.name)) fail(`Capture ${c.name}: not in lib/captures.ts`);
}
// Recorded media: every published file is the one its provenance hashed, and every registry entry has its files.
const mediaProvenance = resolve(root, 'public/captures/provenance-media.json');
if (existsSync(mediaProvenance)) {
  for (const item of JSON.parse(readFileSync(mediaProvenance, 'utf8')).items) {
    const file = resolve(root, 'public', item.file);
    if (!existsSync(file)) fail(`Media ${item.name}: missing ${item.file}`);
    else if (sha256(file) !== item.sha256) fail(`Media ${item.name}: SHA-256 differs from provenance-media.json`);
  }
}
for (const [name, c] of Object.entries(mediaRegistry.captures)) if (!existsSync(resolve(root, 'public/captures', c.file))) fail(`Capture ${name}: missing ${c.file}`);
for (const [name, w] of Object.entries(mediaRegistry.walkthroughs)) for (const path of [w.poster, w.captions, w.metadata, ...w.sources.map(s => s.src)]) if (!existsSync(resolve(root, 'public', path.slice(1)))) fail(`Walkthrough ${name}: missing ${path}`);
if (pending.size) warnings.push(`${pending.size} planned capture(s) or walkthrough(s) not recorded yet — they render nothing until \`pnpm media:record && pnpm media:publish\` runs against the deployed product:`, ...[...pending].map(p => `  ${p}`));

// 5. Architecture graphs and their SVGs.
for (const [name, graph] of Object.entries(graphs)) {
  if (graph.rows.length !== 3 || graph.rows.some(row => row.nodes.length !== 4 || row.arrows.length !== 3)) fail(`Invalid architecture ${name}`);
  for (const path of graph.sources) if (!existsSync(resolve(source, path))) fail(`Architecture ${name}: missing source ${path}`);
  if (!existsSync(resolve(root, 'public/diagrams', `${name}.svg`))) fail(`Missing architecture SVG ${name} — run pnpm diagrams`);
}

// 6. Deployments equal the fragments.
try { execFileSync('node', [resolve(root, 'scripts/sync-deployments.mjs'), '--check'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MITOSHI_SOURCE_DIR: source } }); }
catch { fail('lib/deployments.json differs from contracts/deployments — run pnpm sync:deployments'); }

console.log(`Content: ${pages} pages, ${links} docs links, ${appRoutes} app links, ${media} media, ${hashes} receipts, ${addresses} addresses`);
for (const item of warnings) console.warn(item.startsWith('  ') ? item : `! ${item}`);
if (failures.length) { for (const item of failures) console.error(`✗ ${item}`); process.exitCode = 1; }
else console.log(`✓ source ${pinned}, navigation, links, routes, media, receipts, addresses and deployments`);
