// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../src/engine/interfaces/IEventsEngine.sol";
import {IEngineLens} from "../src/engine/interfaces/IEngineLens.sol";
import {FairValueGuard} from "../src/fair/FairValueGuard.sol";
import {EventVaultV2} from "../src/products/vault/EventVaultV2.sol";
import {DeploymentWriter} from "./lib/DeploymentWriter.sol";

/// @notice Deploys the Trading Balance v2 (S24.1, D-193) — v1 plus the EXIT grant — against the live engine and the
///         deployed FairValueGuard, and records the `vault2` fragment (v1's `vault` stays: S24.2 migrates).
///   forge script script/DeployEventVaultV2.s.sol --rpc-url moderato --broadcast --slow \
///     --private-key <deployer-vault> --tempo.fee-token 0x20C0000000000000000000000000000000000000
///   tsx scripts/deploy/finalize.ts 42431 vault2 DeployEventVaultV2.s.sol && pnpm codegen
contract DeployEventVaultV2 is DeploymentWriter {
    function run() external {
        string memory root = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid));
        string memory j = vm.readFile(string.concat(root, "/engine.json"));
        IEventsEngine engine = IEventsEngine(vm.parseJsonAddress(j, ".contracts.EventsEngine.address"));
        IEngineLens lens = IEngineLens(vm.parseJsonAddress(j, ".contracts.EngineLens.address"));
        FairValueGuard guard = FairValueGuard(vm.parseJsonAddress(vm.readFile(string.concat(root, "/fair.json")), ".contracts.FairValueGuard.address"));
        require(address(engine).code.length > 0 && address(lens).code.length > 0, "engine not on this chain");
        require(lens.engine() == address(engine), "lens does not read this engine");
        require(address(guard).code.length > 0 && address(guard.lens()) == address(lens), "guard not on this lens");
        IERC20 collateral = IERC20(engine.collateral());

        vm.startBroadcast();
        EventVaultV2 vault = new EventVaultV2(collateral, engine, lens, guard);
        vm.stopBroadcast();

        require(lens.crankOptedOut(address(vault)), "vault did not opt out of cranks");
        require(collateral.allowance(address(vault), address(engine)) == type(uint256).max, "engine not approved");
        require(address(vault.fairGuard()) == address(guard), "guard not wired");

        recordContract("EventVaultV2", address(vault), "EventVaultV2.sol:EventVaultV2", false);
        recordParam("engine", vm.toString(address(engine)));
        recordParam("lens", vm.toString(address(lens)));
        recordParam("collateral", vm.toString(address(collateral)));
        recordParam("fairGuard", vm.toString(address(guard)));
        recordParam("maxExitToleranceBps", 2_000);
        recordParam("iocMaxFills", 16);
        recordParam("iocMaxEvictions", 4);
        writePending("vault2");
    }
}
