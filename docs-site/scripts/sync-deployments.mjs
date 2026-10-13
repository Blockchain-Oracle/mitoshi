#!/usr/bin/env node
/**
 * Copies the repository's deployment fragments (`contracts/deployments/<chainId>/<area>.json`, the files the app's
 * `pnpm codegen` reads) into `lib/deployments.json`, so the docs image — built from this directory alone — lists the
 * same addresses the app calls (D-227). `--check` fails when the copy differs from the fragments.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.env.MITOSHI_SOURCE_DIR || resolve(root, '..'));
const fragments = resolve(source, 'contracts/deployments');
const target = resolve(root, 'lib/deployments.json');
const CHAINS = { 42431: 'Tempo testnet (Moderato)', 84532: 'Base Sepolia' };

function readDeployments() {
  if (!existsSync(fragments)) throw new Error(`Deployment fragments missing: ${fragments}`);
  const chains = {};
  for (const [chainId, name] of Object.entries(CHAINS)) {
    const dir = resolve(fragments, chainId);
    if (!existsSync(dir)) continue;
    const areas = {};
    for (const file of readdirSync(dir).filter(f => f.endsWith('.json') && !f.endsWith('.pending.json')).sort()) {
      const f = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
      const contracts = Object.fromEntries(Object.entries(f.contracts ?? {}).map(([n, c]) => [n, {
        address: c.address,
        deployBlock: c.deployBlock ?? null,
        txHash: c.txHash ?? null,
        history: (c.history ?? []).map(h => ({ address: h.address, deployBlock: h.deployBlock ?? null, retiredAtUtc: h.retiredAtUtc ?? null })),
      }]));
      const pools = f.pools ? Object.fromEntries(Object.entries(f.pools).map(([t, p]) => [t, { mirror: p.mirror, poolId: p.poolId, fee: p.poolKey?.fee ?? null, hooks: p.poolKey?.hooks ?? null, status: p.status, positions: (p.positions ?? []).length }])) : undefined;
      areas[f.area] = { commit: f.commit ?? null, deployedAtUtc: f.deployedAtUtc ?? f.updatedAtUtc ?? null, contracts, ...(pools ? { pools } : {}) };
    }
    chains[chainId] = { name, areas };
  }
  return chains;
}

const json = `${JSON.stringify(readDeployments(), null, 2)}\n`;
if (process.argv.includes('--check')) {
  const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
  if (current !== json) { console.error('✗ lib/deployments.json differs from contracts/deployments — run `pnpm sync:deployments`'); process.exitCode = 1; }
  else console.log('✓ lib/deployments.json matches contracts/deployments');
} else {
  writeFileSync(target, json);
  console.log(`Wrote ${target}`);
}
