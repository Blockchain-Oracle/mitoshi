// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/script/DeployGameArena.s.sol (R4-9, D-227) — the DreamDEX module, ERC-6909 and
// venue pins become the engine + lens from `deployments/<chainId>/engine.json`; the address goes into the `arena`
// fragment through `DeploymentWriter` + `scripts/deploy/finalize.ts`. Tiers are Masayume's (Flicky's): Free plus 1 / 5 /
// 10 pathUSD side-pots and a 1 pathUSD cap on any one card's order, in core `STAKE_TIERS` order.
// The windows are Mitoshi's, not Masayume's: Mitoshi's Windows run 5 minutes (one per asset at each boundary), so the
// arena's join + reveal + card life must fit inside one — 30 + 30 + 120 s, with picks open 90 s (a card must outlive
// the pick window). A deck is dealable in the first two minutes of each 5-minute cycle; `setParams` retunes it live.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../src/engine/interfaces/IEventsEngine.sol";
import {IEngineLens} from "../../src/engine/interfaces/IEngineLens.sol";
import {GameArena} from "../../src/products/arena/GameArena.sol";
import {IGameArena} from "../../src/products/arena/IGameArena.sol";
import {DeploymentWriter} from "../lib/DeploymentWriter.sol";

/// @notice Deploys the duel arena against the live engine, prices the four entry tiers and records the `arena` fragment.
///   forge script script/products/DeployGameArena.s.sol --rpc-url moderato --broadcast --slow \
///     --private-key <deployer> --tempo.fee-token 0x20C0000000000000000000000000000000000000
///   tsx scripts/deploy/finalize.ts 42431 arena DeployGameArena.s.sol && pnpm codegen
/// @dev The broadcaster is the admin (testnet single key, Q-016); `setTier` / `setParams` / `setPaused` are its levers.
contract DeployGameArena is DeploymentWriter {
    uint256 internal constant ONE = 1e6;

    function launchParams() public pure returns (IGameArena.Params memory) {
        return IGameArena.Params({joinWindowSec: 30, revealWindowSec: 30, pickWindowSec: 90, minDeckSize: 2, maxDeckSize: 5, minCardLifeSec: 120});
    }

    /// @dev Index → tier, in the order `STAKE_TIERS` declares them in `packages/core/src/games/types.ts`.
    function launchTiers() public pure returns (IGameArena.Tier[4] memory tiers) {
        tiers[0] = IGameArena.Tier({potBase: 0, perCardCapBase: uint128(ONE), enabled: true});
        tiers[1] = IGameArena.Tier({potBase: uint128(ONE), perCardCapBase: uint128(ONE), enabled: true});
        tiers[2] = IGameArena.Tier({potBase: uint128(5 * ONE), perCardCapBase: uint128(ONE), enabled: true});
        tiers[3] = IGameArena.Tier({potBase: uint128(10 * ONE), perCardCapBase: uint128(ONE), enabled: true});
    }

    function run() external returns (GameArena arena) {
        string memory root = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid));
        string memory j = vm.readFile(string.concat(root, "/engine.json"));
        IEventsEngine engine = IEventsEngine(vm.parseJsonAddress(j, ".contracts.EventsEngine.address"));
        IEngineLens lens = IEngineLens(vm.parseJsonAddress(j, ".contracts.EngineLens.address"));
        require(address(engine).code.length > 0 && address(lens).code.length > 0, "engine not on this chain");
        IERC20 collateral = IERC20(engine.collateral());
        IGameArena.Tier[4] memory tiers = launchTiers();

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        arena = new GameArena(collateral, engine, lens, launchParams());
        for (uint8 i = 0; i < 4; i++) {
            arena.setTier(i, tiers[i]);
        }
        vm.stopBroadcast();

        require(lens.crankOptedOut(address(arena)), "arena did not opt out of cranks");
        require(collateral.allowance(address(arena), address(engine)) == type(uint256).max, "engine not approved");
        require(arena.admin() == deployer, "admin not set");
        IGameArena.Params memory p = launchParams();
        recordContract("GameArena", address(arena), "GameArena.sol:GameArena", false);
        recordParam("engine", vm.toString(address(engine)));
        recordParam("lens", vm.toString(address(lens)));
        recordParam("collateral", vm.toString(address(collateral)));
        recordParam("joinWindowSec", p.joinWindowSec);
        recordParam("revealWindowSec", p.revealWindowSec);
        recordParam("pickWindowSec", p.pickWindowSec);
        recordParam("minDeckSize", p.minDeckSize);
        recordParam("maxDeckSize", p.maxDeckSize);
        recordParam("minCardLifeSec", p.minCardLifeSec);
        recordRole("ADMIN", deployer);
        writePending("arena");
    }
}
