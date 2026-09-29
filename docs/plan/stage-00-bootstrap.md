# S0 — Bootstrap, hosting, decisions, archive (M0)

- [x] S0.1 `docs/plan/{00-plan (this plan), STATUS, decisions (D-001…D-009 owner; D-010… = §1.2; Q-table §8), parity
  (working copy of ledger 12 + Owner/Status + MOB and UX rows), working-rules, owner-actions (dated, §8), fragments,
  env-matrix}.md`; `docs/specs/{engine.md ← App. A, pillar2.md ← App. B, offchain.md ← App. C, v4-replay.md ← B.3.1
  table, mobile.md ← App. D, ux.md ← App. E}`. Src: Agari `docs/plan/working-rules.md`.
- [x] S0.2 Doc sync (§1.3) in `context/tempo/17`, `12`, `13`, `04`, `05`, `STATUS.md`.
- [x] S0.3 Root: `package.json`, `pnpm-workspace.yaml` (catalog C.1.3; workspace includes `mobile`, whose Expo-pinned
  React/RN versions live in a named `mobile` catalog, D.1), `tsconfig.base.json`, `vitest.config.ts`, `.nvmrc` 24,
  `.gitignore`, `THIRD_PARTY_NOTICES.md`. Src: Masayume root.
- [x] S0.4 Scaffolds: `packages/{core,markets,brain,db,clients}`, `services/ops` (hello `runActor` + `/health`),
  `web` (hello + `/api/health`), `scripts/{codegen,invariants,keys,deploy,drive,archive,e2e}`.
- [x] S0.5 `contracts/`: `foundry.toml` (default Tempo, `evm`, `ci`, `invariant` profiles, rpc endpoints), all libs
  (forge-std, tempo-std@b9860ac, OZ 5.x + upgradeable, solady, OZ uniswap-hooks@2ae32be, v4-core@46c6834 +
  v4-periphery interfaces/libraries, LayerZero oapp-evm/oft-evm/oft-evm-upgradeable/protocol/messagelib/test-devtools),
  `script/lib/DeploymentWriter.sol`, `deployments/README.md` (fragment schema C.1.6).
- [ ] S0.6 `scripts/codegen/clients.mjs` + `packages/clients/src/pinned.ts` (C.1.6). Src: Masayume `contracts/export.mjs`.
- [ ] S0.7 `scripts/invariants/*` with the rule set C.1.2. Src: Masayume `scripts/invariants/*`.
- [ ] S0.8 `.github/workflows/{ci,contracts,nightly-fork,deploy-ops}.yml`.
- [ ] S0.9 Hosting (owner accounts): Vercel ×2, Fly ×2, Neon ×2, Upstash; DNS on the final domain (Q-019).
- [ ] S0.10 Keys: `scripts/keys/{generate.mjs,fund-moderato.ts}` (addresses only in acceptance); Robinhood testnet
  ETH + daily faucet claims start (X11); Base Sepolia ETH; capped mainnet MPP wallet once Q-020 is approved.
- [ ] S0.11 Archive takeover: `packages/db/migrations/prints/0001_print_archive.sql`; price-relay archive-pass on Fly
  (`OPS_ACTORS=archive`, no key); `scripts/archive/import-agari.ts` (Agari `stocklana/data/archive/redstone/*.jsonl`
  + a `print_archive` dump); overlap check; then the owner retires the laptop archiver.
- [ ] S0.12 `infra/{secrets.md, env/*.example, vercel.md, fly.md}`; README pre-existing-code disclosure.
- [ ] S0.13 `docs/design/{DESIGN.md, design.json, components.md, flow-targets.md}` (tokens, overlay rule, §2 principles,
  §2.4 targets); copy the two plan-mode reports (`~/.claude/plans/sunny-forging-simon-agent-a06e6eaf7974656e0.md` →
  `context/tempo/research-2026-09-29/open-libs.md`, `…-agent-a983473fcdee56215.md` → `21st-weak.md`);
  `docs/libraries.md` indexing the Context7-derived notes (research files + D45–D47) per library;
  `.gitignore` gains `.21st/`; CI budget job skeleton (§3.1).
- **Gate:** `pnpm install && pnpm typecheck && pnpm invariants && pnpm codegen:check`; `forge build` both profiles
  (version recorded); hello + `/api/health` on the final domain; ops `/health` 200 with `archive` beating and a
  boundary row archived < 60 s after T; keys funded; design docs present. **Rows:** N-10, N-11, M-15.

## Findings

- LayerZero V2 comes from npm (`@layerzerolabs/*`, its documented Foundry setup) with remappings; everything else is a
  pinned submodule: forge-std v1.16.2, tempo-std b9860ac, OZ + upgradeable v5.7.0, solady v0.1.26, uniswap-hooks
  2ae32be, v4-core 46c6834, v4-periphery 9969eec, v4-hooks-public e4eabe5, permit2 cc56ad0 (v4-periphery's pin, added
  directly instead of recursive submodules). LayerZero also needs `solidity-bytes-utils`.
- Foundry 1.8.3 `network = "tempo"` sets `evm_version = "osaka"` itself.
- Deployment fragments: scripts write `<area>.pending.json`; `scripts/deploy/finalize.ts` (S0.6) adds tx hashes/blocks.

## Handoff

_Not started._
