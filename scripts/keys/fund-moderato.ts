/**
 * Funds every testnet role address from the Moderato faucet (`tempo_fundAddress`) and prints role → pathUSD balance.
 * Plan S0.10. Reads addresses from `~/.config/cwf/testnet/*.json`; never reads or prints private keys.
 *
 *   tsx scripts/keys/fund-moderato.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createPublicClient, erc20Abi, formatUnits, http, type Address } from "viem";
import { tempoModerato } from "viem/chains";

const RPC = process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
const PATH_USD: Address = "0x20C0000000000000000000000000000000000000";
const client = createPublicClient({ chain: tempoModerato, transport: http(RPC) });
const dir = join(homedir(), ".config", "cwf", "testnet");

const roles = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as { role: string; address: Address });

for (const { role, address } of roles) {
  const before = await client.readContract({ address: PATH_USD, abi: erc20Abi, functionName: "balanceOf", args: [address] });
  let result: unknown = "skipped (already funded)";
  if (before === 0n) result = await client.request({ method: "tempo_fundAddress" as never, params: [address] as never });
  console.log(`${role.padEnd(16)} ${address} pathUSD before ${formatUnits(before, 6)} → fund: ${JSON.stringify(result)}`);
}
await new Promise((r) => setTimeout(r, 4000));
for (const { role, address } of roles) {
  const after = await client.readContract({ address: PATH_USD, abi: erc20Abi, functionName: "balanceOf", args: [address] });
  console.log(`${role.padEnd(16)} pathUSD after ${formatUnits(after, 6)}`);
}
