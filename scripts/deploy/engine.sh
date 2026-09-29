#!/usr/bin/env bash
# S2.11: ensure the engine venue on a Tempo node (D-059: Moderato, or `anvil --network tempo [--fork-url …]`).
#   scripts/deploy/engine.sh <network: testnet> <rpc-url>
# 1. DeployEngine only when no engine fragment is recorded for the chain (forge deploys linked libraries up front, so
#    the deploy path is its own script); 2. EnsureEngine fails on any drift from the venue spec and roles;
# 3. RegisterSeries and 4. ReserveNodes are ensure-style (create what is missing, fail on drift); each broadcast is
# finalized into contracts/deployments/<chainId>/engine.json; then `pnpm codegen`.
# Keys come from ~/.config/cwf/<network>/<role>.json and are never printed.
set -euo pipefail
NETWORK="${1:?network}"
RPC="${2:?rpc url}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
KEYS="$HOME/.config/cwf/$NETWORK"
field() { python3 -c "import json,sys;print(json.load(open(sys.argv[1]))[sys.argv[2]])" "$1" "$2"; }
PK="$(field "$KEYS/deployer.json" privateKey)"
export ROLLER; ROLLER="$(field "$KEYS/roller.json" address)"
export ATTESTOR; ATTESTOR="$(field "$KEYS/price-relay.json" address)"
FEE=(--tempo.fee-token 0x20C0000000000000000000000000000000000000)
CHAIN="$(cast chain-id --rpc-url "$RPC")"
cd "$ROOT/contracts"

run() { # <Script.s.sol> <contract> [--broadcast]
  local file="$1" name="$2"; shift 2
  forge script "script/$file:$name" --rpc-url "$RPC" --private-key "$PK" "${FEE[@]}" "$@"
}
finalize() { # <Script.s.sol>
  local pending="deployments/$CHAIN/engine.pending.json" bc="broadcast/$1/$CHAIN/run-latest.json"
  if [ -f "$pending" ] && [ -f "$bc" ] && [ "$bc" -nt "$pending" -o "$bc" -ot "$pending" ]; then
    if [ "$(find "$bc" -newer "$pending.stamp" 2>/dev/null | wc -l)" -gt 0 ]; then
      (cd "$ROOT" && pnpm --dir scripts exec tsx deploy/finalize.ts "$CHAIN" engine "$1")
    else
      rm -f "$pending" # nothing was broadcast: the fragment already holds this state
    fi
  else
    rm -f "$pending"
  fi
  rm -f "$pending.stamp"
}
stamp() { mkdir -p "deployments/$CHAIN"; touch "deployments/$CHAIN/engine.pending.json.stamp"; sleep 1; }

if [ ! -f "deployments/$CHAIN/engine.json" ]; then
  stamp; run DeployEngine.s.sol DeployEngine --broadcast --slow; finalize DeployEngine.s.sol
fi
run EnsureEngine.s.sol EnsureEngine
stamp; run RegisterSeries.s.sol RegisterSeries --broadcast --slow; finalize RegisterSeries.s.sol
stamp; run ReserveNodes.s.sol ReserveNodes --broadcast --slow; finalize ReserveNodes.s.sol
(cd "$ROOT" && pnpm codegen)
echo "engine venue ensured on chain $CHAIN"
