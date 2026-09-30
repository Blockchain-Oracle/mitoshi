// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/script/DeployLeverageReserve.s.sol — the DreamDEX module and ERC-6909 pins
// become the engine + lens from `deployments/<chainId>/engine.json` and the PD-2 guard from `fair.json`; the address goes
// into the `leverage` fragment through `DeploymentWriter` + `scripts/deploy/finalize.ts`. Launch parameters are
// Masayume's (A.8: 3×, an 8 % premium on the front, a 120 % maintenance line, 60 % exposure; entry 0.05–0.95, 200 per
// position, 500 per Window, 64 open, no opens in the last 90 s before lock) plus the Tempo seam's (D-174): the rested
// walks at the grid's 20 s and a 0.05 fair-value ceiling on entry. The 8 %/120 % are Yosuku's numbers (inherited).

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../src/engine/interfaces/IEventsEngine.sol";
import {IEngineLens} from "../../src/engine/interfaces/IEngineLens.sol";
import {FairValueGuard} from "../../src/fair/FairValueGuard.sol";
import {ILeverageReserve} from "../../src/products/leverage/ILeverageReserve.sol";
import {LeverageReserve} from "../../src/products/leverage/LeverageReserve.sol";
import {DeploymentWriter} from "../lib/DeploymentWriter.sol";

/// @notice Deploys the leverage reserve (S10c, A.4.3) against the live engine and guard and records the `leverage`
///         fragment.
///   forge script script/products/DeployLeverageReserve.s.sol --rpc-url moderato --broadcast --slow \
///     --private-key <deployer-tickets> --tempo.fee-token 0x20C0000000000000000000000000000000000000
///   tsx scripts/deploy/finalize.ts 42431 leverage DeployLeverageReserve.s.sol && pnpm codegen
/// @dev The broadcaster is the admin (testnet single key, Q-016). `setParams` tunes the terms without a redeploy.
contract DeployLeverageReserve is DeploymentWriter {
    uint256 internal constant ONE = 1e6;

    function launchParams() public pure returns (ILeverageReserve.Params memory) {
        return ILeverageReserve.Params({
            maxLeverageBps: 30_000,
            premiumBps: 800,
            maintenanceBps: 12_000,
            maxExposureBps: 6_000,
            minEntryPriceRaw: 50_000,
            maxEntryPriceRaw: 950_000,
            maxFrontedPerPosition: 200 * ONE,
            maxWindowFronted: 500 * ONE,
            maxOpenPositions: 64,
            minTimeLeftSec: 90,
            minRestSec: 20,
            fairSlackRaw: 50_000
        });
    }

    function run() external returns (LeverageReserve reserve) {
        string memory root = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid));
        string memory j = vm.readFile(string.concat(root, "/engine.json"));
        IEventsEngine engine = IEventsEngine(vm.parseJsonAddress(j, ".contracts.EventsEngine.address"));
        IEngineLens lens = IEngineLens(vm.parseJsonAddress(j, ".contracts.EngineLens.address"));
        FairValueGuard guard = FairValueGuard(vm.parseJsonAddress(vm.readFile(string.concat(root, "/fair.json")), ".contracts.FairValueGuard.address"));
        require(address(engine).code.length > 0 && address(lens).code.length > 0 && address(guard).code.length > 0, "venue not on this chain");
        IERC20 collateral = IERC20(engine.collateral());

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        reserve = new LeverageReserve(collateral, engine, lens, guard, launchParams());
        vm.stopBroadcast();

        require(lens.crankOptedOut(address(reserve)), "reserve did not opt out of cranks");
        require(collateral.allowance(address(reserve), address(engine)) == type(uint256).max, "engine not approved");
        require(reserve.admin() == deployer && address(reserve.guard()) == address(guard), "roles not set");
        ILeverageReserve.Params memory p = launchParams();
        recordContract("LeverageReserve", address(reserve), "LeverageReserve.sol:LeverageReserve", false);
        recordParam("engine", vm.toString(address(engine)));
        recordParam("lens", vm.toString(address(lens)));
        recordParam("guard", vm.toString(address(guard)));
        recordParam("collateral", vm.toString(address(collateral)));
        recordParam("maxLeverageBps", p.maxLeverageBps);
        recordParam("premiumBps", p.premiumBps);
        recordParam("maintenanceBps", p.maintenanceBps);
        recordParam("maxExposureBps", p.maxExposureBps);
        recordParam("minEntryPriceRaw", p.minEntryPriceRaw);
        recordParam("maxEntryPriceRaw", p.maxEntryPriceRaw);
        recordParam("maxFrontedPerPosition", p.maxFrontedPerPosition);
        recordParam("maxWindowFronted", p.maxWindowFronted);
        recordParam("maxOpenPositions", p.maxOpenPositions);
        recordParam("minTimeLeftSec", p.minTimeLeftSec);
        recordParam("minRestSec", p.minRestSec);
        recordParam("fairSlackRaw", p.fairSlackRaw);
        recordRole("ADMIN", deployer);
        writePending("leverage");
    }
}
