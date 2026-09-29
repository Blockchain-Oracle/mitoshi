# Deployment fragments (schema v1)

One file per network and area: `deployments/<chainId>/<area>.json`. Areas never share a file, so parallel stages never
conflict (see `docs/plan/fragments.md`). `pnpm codegen` turns every fragment into `packages/clients` (plan C.1.6).

```jsonc
{
  "schema": 1,
  "chainId": 42431,
  "area": "engine",                     // engine | vault | maker | … | stocks | themes | launch | v4 | pools
  "commit": "c24e9ef",                  // repo commit the contracts were built from
  "deployedAtUtc": "2026-10-01T12:00:00Z",
  "deployer": "0x…",
  "contracts": {
    "EventsEngine": {
      "address": "0x…",
      "artifact": "EventsEngine.sol:EventsEngine",
      "profile": "default",             // default (Tempo) | evm
      "deployBlock": 123,
      "txHash": "0x…",
      "proxy": false,
      "history": [{ "address": "0x…", "deployBlock": 100, "retiredAtUtc": "…" }]
    }
  },
  "roles": { "ROLLER": "0x…" },
  "params": { "lotBase": "1000" },
  "external": { "pathUSD": "0x20c0000000000000000000000000000000000000" }
}
```

Flow: a deploy script inherits `script/lib/DeploymentWriter.sol` and writes `<area>.pending.json` → `forge script …
--broadcast` → `scripts/deploy/finalize.ts <chainId> <area>` merges the pending file with the broadcast receipts
(`deployBlock`, `txHash`, `commit`, `deployedAtUtc`), moves any replaced address into `history[]` (so the indexer keeps
old Moderato addresses) and deletes the pending file → `pnpm codegen`. Fragments are committed; pending files are not.
