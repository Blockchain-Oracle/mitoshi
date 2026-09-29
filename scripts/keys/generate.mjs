/**
 * Generates role keys into `~/.config/cwf/<network>/<role>.json` (mode 0600). Never overwrites an existing key and
 * never prints a private key — only role → address, which is what acceptance records. Plan S0.10.
 *
 *   node scripts/keys/generate.mjs testnet
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(join(import.meta.dirname, "..", "package.json"));
const { generatePrivateKey, privateKeyToAddress } = await import(require.resolve("viem/accounts"));

/** Roles from plan C.5.2 / C.6 that sign on their own. Mainnet adds MPP payer after Q-020. */
export const ROLES = ["deployer", "deployer-launch", "deployer-themes", "deployer-products", "deployer-vault", "deployer-maker", "relay-fee-payer", "roller", "price-relay", "settler", "seed-maker", "earn-quoter", "keeper", "x-relay", "desk", "stock-sync", "ops-fee-payer"];

const network = process.argv[2];
if (network !== "testnet" && network !== "mainnet") throw new Error("usage: generate.mjs <testnet|mainnet>");
const dir = join(homedir(), ".config", "cwf", network);
mkdirSync(dir, { recursive: true, mode: 0o700 });

const rows = [];
for (const role of ROLES) {
  const path = join(dir, `${role}.json`);
  if (existsSync(path)) {
    rows.push([role, JSON.parse(readFileSync(path, "utf8")).address, "kept"]);
    continue;
  }
  const privateKey = generatePrivateKey();
  const address = privateKeyToAddress(privateKey);
  writeFileSync(path, JSON.stringify({ role, network, address, privateKey }, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
  rows.push([role, address, "new"]);
}
for (const [role, address, state] of rows) console.log(`${role.padEnd(16)} ${address} ${state}`);
