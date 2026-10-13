#!/usr/bin/env node
/**
 * Publish what `record-media.mjs` recorded (ported from Owarine 90a91d71:docs-site/scripts/publish-captures.mjs and the
 * encode step of render-walkthroughs.mjs, D-227). A capture's PNG is copied byte for byte; a walkthrough's lossless
 * frames are encoded once to H.264 at their recorded timing (a constant 20 fps sequence; no cuts, no speed-ups) with WebVTT captions from its
 * chapter marks and a poster from its own frames. Every published file's SHA-256 goes into
 * public/captures/provenance-media.json, which `pnpm check:content` re-hashes; lib/media.generated.json is the registry
 * the guides render from. Items that failed, are missing or aren't in the plan are skipped and named.
 *
 *   pnpm media:publish        # needs ffmpeg and ffprobe on PATH for walkthroughs
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plan = JSON.parse(readFileSync(resolve(root, 'scripts/media-plan.json'), 'utf8'));
const origin = new URL(plan.origin).origin;
const raw = resolve(root, 'evidence/raw-media');
const capturesOut = resolve(root, 'public/captures');
const videosOut = resolve(root, 'public/videos');
const registryFile = resolve(root, 'lib/media.generated.json');
const provenanceFile = resolve(capturesOut, 'provenance-media.json');
const FPS = 20;
mkdirSync(capturesOut, { recursive: true });
mkdirSync(videosOut, { recursive: true });

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const kebab = name => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const day = iso => iso.slice(0, 10);
const longDate = iso => new Date(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
const stamp = s => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${(s % 60).toFixed(3).padStart(6, '0')}`;
const registry = existsSync(registryFile) ? JSON.parse(readFileSync(registryFile, 'utf8')) : { captures: {}, walkthroughs: {} };
const provenance = existsSync(provenanceFile) ? JSON.parse(readFileSync(provenanceFile, 'utf8')) : { origin, items: [] };
const skipped = [];
const published = [];
const record = item => { provenance.items = provenance.items.filter(i => !(i.name === item.name && i.kind === item.kind)); provenance.items.push(item); };
const drop = (dir, prefix, keep) => { for (const f of readdirSync(dir)) if (f.startsWith(prefix) && !keep.includes(f)) rmSync(resolve(dir, f)); };

// 1. Captures.
for (const c of plan.captures) {
  const png = resolve(raw, 'captures', `${c.name}.png`);
  const side = resolve(raw, 'captures', `${c.name}.json`);
  if (existsSync(resolve(raw, 'captures', `${c.name}.failed.json`))) { skipped.push(`${c.name}: failed when recorded`); continue; }
  if (!existsSync(png) || !existsSync(side)) { skipped.push(`${c.name}: not recorded`); continue; }
  const meta = JSON.parse(readFileSync(side, 'utf8'));
  const bytes = readFileSync(png);
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`${c.name}: not a PNG`);
  if (sha256(bytes) !== meta.sha256) throw new Error(`${c.name}: bytes differ from the recorder's hash`);
  if (new URL(meta.url).origin !== origin || meta.status >= 400) throw new Error(`${c.name}: not a live product page (${meta.url}, ${meta.status})`);
  const width = bytes.readUInt32BE(16) / 2, height = bytes.readUInt32BE(20) / 2;
  const file = `${kebab(c.name)}-${day(meta.capturedAt)}.png`;
  copyFileSync(png, resolve(capturesOut, file));
  drop(capturesOut, `${kebab(c.name)}-2`, [file]);
  registry.captures[c.name] = { title: c.title, file, alt: c.alt, state: c.state ?? 'Signed out; live testnet data as the page showed it.', date: longDate(meta.capturedAt), width, height };
  record({ kind: 'capture', name: c.name, file: `captures/${file}`, sha256: meta.sha256, url: meta.url, capturedAt: meta.capturedAt, viewport: meta.viewport, method: 'Headless Chromium at 2×, lossless PNG, copied unmodified.' });
  published.push(`capture ${c.name}`);
}

// 2. Walkthroughs.
const ffmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
for (const w of plan.walkthroughs) {
  const dir = resolve(raw, 'videos', w.name);
  if (existsSync(resolve(dir, 'failed.json'))) { skipped.push(`${w.name}: failed when recorded (${JSON.parse(readFileSync(resolve(dir, 'failed.json'), 'utf8')).error})`); continue; }
  if (!existsSync(resolve(dir, 'frames.json'))) { skipped.push(`${w.name}: not recorded`); continue; }
  if (!ffmpeg) { skipped.push(`${w.name}: ffmpeg/ffprobe not on PATH`); continue; }
  const meta = JSON.parse(readFileSync(resolve(dir, 'frames.json'), 'utf8'));
  if (meta.origin !== origin || meta.frames.length < 2) throw new Error(`${w.name}: not a live recording`);
  for (const f of meta.frames) if (sha256(readFileSync(resolve(dir, f.file))) !== f.sha256) throw new Error(`${w.name}: ${f.file} differs from the recorder's hash`);
  const end = Math.max(meta.durationMs, meta.frames.at(-1).t) + 1200;
  // A constant-rate sequence at the recorded pace: output frame k shows the source frame current at k / FPS seconds
  // (links, not copies), so the clip lasts exactly as long as the recording plus a 1.2 s hold.
  const seq = resolve(dir, 'seq');
  rmSync(seq, { recursive: true, force: true });
  mkdirSync(seq);
  for (let k = 0, j = 0; k < Math.ceil((end / 1000) * FPS); k++) {
    while (j + 1 < meta.frames.length && meta.frames[j + 1].t <= (k * 1000) / FPS) j++;
    symlinkSync(resolve(dir, meta.frames[j].file), resolve(seq, `${String(k).padStart(6, '0')}.png`));
  }
  const base = `${w.name}-${day(meta.capturedAt)}`;
  const mp4 = resolve(videosOut, `${base}.mp4`);
  const scale = meta.viewport.width > 1000 ? 'scale=1920:-2' : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', resolve(seq, '%06d.png'), '-vf', `${scale},format=yuv420p`, '-r', '30', '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', '-an', mp4]);
  rmSync(seq, { recursive: true, force: true });
  const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], { encoding: 'utf8' }).trim());
  if (!(duration > 2)) throw new Error(`${w.name}: encoded clip is ${duration} s`);
  const chapters = meta.marks.map(m => ({ time: Math.round(m.t / 100) / 10, title: m.title, text: m.text }));
  const vtt = ['WEBVTT', '', ...chapters.flatMap((c, i) => [`${stamp(c.time)} --> ${stamp(chapters[i + 1]?.time ?? duration)}`, `${c.title}. ${c.text}`, ''])].join('\n');
  writeFileSync(resolve(videosOut, `${base}.vtt`), vtt);
  // The poster is the clip's own frame half a second into its second chapter (or its last frame).
  const posterAt = Math.min(duration - 0.1, (chapters[1]?.time ?? duration - 0.6) + 0.5);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', posterAt.toFixed(2), '-i', mp4, '-frames:v', '1', '-q:v', '3', resolve(videosOut, `${base}.jpg`)]);
  const files = [`${base}.mp4`, `${base}.vtt`, `${base}.jpg`];
  const hashes = Object.fromEntries(files.map(f => [f, sha256(readFileSync(resolve(videosOut, f)))]));
  const metaFile = `${base}.json`;
  writeFileSync(resolve(videosOut, metaFile), `${JSON.stringify({ name: w.name, origin, url: meta.url, capturedAt: meta.capturedAt, viewport: meta.viewport, sourceFrames: meta.frames.length, sourceDurationMs: meta.durationMs, chapters, method: 'Headless Chromium, signed out; lossless 2× frames every ~150 ms encoded at their recorded timing. No cuts, no speed-ups, no pointer drawn.', sha256: hashes }, null, 2)}\n`);
  drop(videosOut, `${w.name}-2`, [...files, metaFile]);
  registry.walkthroughs[w.name] = { title: w.title, description: w.description, poster: `/videos/${base}.jpg`, duration: Math.round(duration * 10) / 10, capturedAt: meta.capturedAt, origin, chapters, sources: [{ src: `/videos/${base}.mp4`, type: 'video/mp4' }], captions: `/videos/${base}.vtt`, metadata: `/videos/${metaFile}` };
  for (const f of files) record({ kind: 'walkthrough', name: `${w.name}:${f.split('.').pop()}`, file: `videos/${f}`, sha256: hashes[f], url: meta.url, capturedAt: meta.capturedAt, viewport: meta.viewport, method: 'Encoded from the recorder\'s hashed frames.' });
  published.push(`walkthrough ${w.name} (${duration.toFixed(1)} s)`);
}

// 3. Registry and provenance, without entries whose files are gone.
for (const [name, c] of Object.entries(registry.captures)) if (!existsSync(resolve(capturesOut, c.file))) delete registry.captures[name];
for (const [name, w] of Object.entries(registry.walkthroughs)) if (!existsSync(resolve(root, 'public', w.sources[0].src.slice(1)))) delete registry.walkthroughs[name];
provenance.items = provenance.items.filter(i => existsSync(resolve(root, 'public', i.file)));
provenance.publishedAt = new Date().toISOString();
writeFileSync(registryFile, `${JSON.stringify(registry, null, 2)}\n`);
if (provenance.items.length || existsSync(provenanceFile)) writeFileSync(provenanceFile, `${JSON.stringify(provenance, null, 2)}\n`);
console.log(`Published ${published.length}: ${published.join(', ') || 'nothing'}`);
for (const s of skipped) console.warn(`! skipped ${s}`);
