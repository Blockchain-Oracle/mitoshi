<!-- Copied from the approved build plan (v5, 2026-09-29). Change it only through D-entries in docs/plan/decisions.md. -->

# Uniswap v4 on Moderato — replay of the mainnet CREATE2 deployments

**B.3.1 Moderato replay** (Arachnid `0x4e59b44847b379578588920cA78FbF26c0B4956C`, calldata = `salt ‖ initcode+args`):

| # | Contract → address | Mainnet creation tx (block) |
|---|---|---|
| 1 | PoolManager `0x33620f62c5b9b2086dd6b62f4a297a9f30347029` | `0x0eeeeb32101a5bee087e55bc6a699aa4ec2f4e749f93c224f95b42fccce52205` (6,455,926) |
| 2 | PositionDescriptor impl `0x269ac84585a8c1012ad913573adf8a6c9df48897` | `0x4b623d4e065f5cec00a428a654861b24b0b1832ebafd6687b05182304ef7f7d0` (6,458,512) |
| 3 | TransparentUpgradeableProxy `0xc73ed2cba8c347593d1d9120aa0be8ff88c6ff77` | `0x42741eb36ff996f494a0a2dab26036d324068c1a06e5b3083a664350a53ee41f` (6,458,515) |
| 4 | PositionManager `0x3fc79444f8eacc1894775493ff3fa41f1e35ce11` | `0xbb2ee84a2edbf378d31712240d25816cbbc69ef6792be199c4c6877ad861a53e` (6,458,520) |
| 5 | V4Quoter `0x20e6487c371a2086f841ef453f85378223df4f4e` | `0xf53d1572806c1416a6090f0c993b0b9970b54c16916d4759632b8ebe620bb61a` (6,458,523) |
| 6 | StateView `0x21b954fba3f5ddebe77ef2d47a3100c066908b2a` | `0x4f0c36c0c63a2bfb4b87e101a5f65dfa266e772b7a8f1092d6b3eb9b7de95ee3` (6,458,526) |
| 7 | UniversalRouter (pinned) `0xa2dc7d0266f0cc50b3eeaf36c9bfcecff1beea91` | `0x1332bf9fe185668b065afb129c62c93ca4a95c4888ea6630d7e97925fc2bb7cd` (6,458,542) |

Procedure (`scripts/v4/replay-moderato.ts`, root key — access keys can't CREATE): fetch `cast tx $HASH input` on mainnet,
check `to == Arachnid`, split salt/initcode, `cast create2` must print the expected address, send only if no code on
Moderato (`--gas-limit 29500000 --tempo.fee-token pathUSD --priority-gas-price 1`), one per block, in order.
Verification (`verify-replay.ts`): code hashes equal for rows 1–3, 5–7; row 4 may differ only in words equal to
4217→42431 or the two `DOMAIN_SEPARATOR()`s; immutables read back; writes `deployments/42431/v4.json`. Mainnet config
`packages/clients/src/addresses/v4.ts` (official addresses, UR `0xa2dc`, aggregator hook `0x7169…6888` from pool
`0x00cdb9b1…`'s Initialize log; mainnet only). UR ABI probe (X3) on a mainnet fork decides the encoder.
