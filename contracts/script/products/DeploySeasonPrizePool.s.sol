// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/script/DeploySeasonPrizePool.s.sol (R4-9, D-227) — the collateral is the live
// engine's (pathUSD) from `deployments/<chainId>/engine.json`, and the address goes into the `arena` fragment beside the
// GameArena (finalize merges contracts) through `DeploymentWriter` + `scripts/deploy/finalize.ts`.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../src/engine/interfaces/IEventsEngine.sol";
import {SeasonPrizePool} from "../../src/products/arena/SeasonPrizePool.sol";
import {DeploymentWriter} from "../lib/DeploymentWriter.sol";

/// @notice Deploys a season's prize pool over the engine's collateral; the season is the operator's to name.
///   SEASON_ID=season-1 SEASON_ENDS_AT_SEC=<unix> forge script script/products/DeploySeasonPrizePool.s.sol \
///     --rpc-url moderato --broadcast --slow --private-key <deployer> --tempo.fee-token 0x20C0000000000000000000000000000000000000
///   tsx scripts/deploy/finalize.ts 42431 arena DeploySeasonPrizePool.s.sol && pnpm codegen
/// @dev The broadcaster is the admin who `distribute`s at season end; anyone may `deposit` from the moment it exists.
contract DeploySeasonPrizePool is DeploymentWriter {
    function run() external returns (SeasonPrizePool pool) {
        string memory root = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid));
        IEventsEngine engine = IEventsEngine(vm.parseJsonAddress(vm.readFile(string.concat(root, "/engine.json")), ".contracts.EventsEngine.address"));
        require(address(engine).code.length > 0, "engine not on this chain");
        IERC20 collateral = IERC20(engine.collateral());
        string memory seasonId = vm.envString("SEASON_ID");
        uint64 endsAtSec = uint64(vm.envUint("SEASON_ENDS_AT_SEC"));
        require(endsAtSec > block.timestamp, "the season must end in the future");

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        pool = new SeasonPrizePool(collateral, seasonId, endsAtSec);
        vm.stopBroadcast();

        require(pool.admin() == deployer && address(pool.token()) == address(collateral), "pool not set");
        recordContract("SeasonPrizePool", address(pool), "SeasonPrizePool.sol:SeasonPrizePool", false);
        recordParam("seasonId", seasonId);
        recordParam("seasonEndsAtSec", uint256(endsAtSec));
        writePending("arena");
    }
}
