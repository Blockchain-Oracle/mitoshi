// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/script/DeployParlayReserve.s.sol — the DreamDEX module pin becomes the engine +
// lens from `deployments/<chainId>/engine.json` (the venue pin) and the PD-2 guard from `fair.json`; the collateral is
// the engine's own; the address goes into the `parlay` fragment through `DeploymentWriter` + `scripts/deploy/finalize.ts`.
// Launch parameters are Masayume's (12 % margin, λ 0.40, 3 legs, 60 % exposure, 500 per ticket, 1,000 per instant, a
// 2 % floor, priced over at least 20 contracts) plus the two the Tempo seam adds (D-165): the D-109 rest floor at the
// venue grid's 20 s and a PD-2 slack of 0.05 per leg.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../src/engine/interfaces/IEventsEngine.sol";
import {IEngineLens} from "../../src/engine/interfaces/IEngineLens.sol";
import {FairValueGuard} from "../../src/fair/FairValueGuard.sol";
import {IParlayReserve} from "../../src/products/parlay/IParlayReserve.sol";
import {ParlayReserve} from "../../src/products/parlay/ParlayReserve.sol";
import {DeploymentWriter} from "../lib/DeploymentWriter.sol";

/// @notice Deploys the parlay reserve (S10a, A.4.6) against the live engine and guard and records the `parlay` fragment.
///   forge script script/products/DeployParlayReserve.s.sol --rpc-url moderato --broadcast --slow \
///     --private-key <deployer-tickets> --tempo.fee-token 0x20C0000000000000000000000000000000000000
///   tsx scripts/deploy/finalize.ts 42431 parlay DeployParlayReserve.s.sol && pnpm codegen
/// @dev The broadcaster is the admin (testnet single key, Q-016). `setParams` tunes the terms without a redeploy.
contract DeployParlayReserve is DeploymentWriter {
    uint256 internal constant ONE = 1e6;

    function launchParams() public pure returns (IParlayReserve.Params memory) {
        return IParlayReserve.Params({
            marginBps: 1_200,
            maxExposureBps: 6_000,
            correlationBps: 4_000,
            maxLegs: 3,
            maxPayoutCap: 500 * ONE,
            maxExpiryLocked: 1_000 * ONE,
            minCombinedProbRaw: 20_000,
            priceDepthRaw: 20 * ONE,
            minRestSec: 20,
            fairSlackRaw: 50_000
        });
    }

    function run() external returns (ParlayReserve reserve) {
        string memory root = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid));
        string memory j = vm.readFile(string.concat(root, "/engine.json"));
        IEventsEngine engine = IEventsEngine(vm.parseJsonAddress(j, ".contracts.EventsEngine.address"));
        IEngineLens lens = IEngineLens(vm.parseJsonAddress(j, ".contracts.EngineLens.address"));
        FairValueGuard guard = FairValueGuard(vm.parseJsonAddress(vm.readFile(string.concat(root, "/fair.json")), ".contracts.FairValueGuard.address"));
        require(address(engine).code.length > 0 && address(lens).code.length > 0 && address(guard).code.length > 0, "venue not on this chain");
        IERC20 collateral = IERC20(engine.collateral());

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        reserve = new ParlayReserve(collateral, engine, lens, guard, launchParams());
        vm.stopBroadcast();

        require(lens.crankOptedOut(address(reserve)), "reserve did not opt out of cranks");
        require(reserve.admin() == deployer && address(reserve.guard()) == address(guard), "roles not set");

        IParlayReserve.Params memory p = launchParams();
        recordContract("ParlayReserve", address(reserve), "ParlayReserve.sol:ParlayReserve", false);
        recordParam("engine", vm.toString(address(engine)));
        recordParam("lens", vm.toString(address(lens)));
        recordParam("guard", vm.toString(address(guard)));
        recordParam("collateral", vm.toString(address(collateral)));
        recordParam("marginBps", p.marginBps);
        recordParam("maxExposureBps", p.maxExposureBps);
        recordParam("correlationBps", p.correlationBps);
        recordParam("maxLegs", p.maxLegs);
        recordParam("maxPayoutCap", p.maxPayoutCap);
        recordParam("maxExpiryLocked", p.maxExpiryLocked);
        recordParam("minCombinedProbRaw", p.minCombinedProbRaw);
        recordParam("priceDepthRaw", p.priceDepthRaw);
        recordParam("minRestSec", p.minRestSec);
        recordParam("fairSlackRaw", p.fairSlackRaw);
        recordRole("ADMIN", deployer);
        writePending("parlay");
    }
}
