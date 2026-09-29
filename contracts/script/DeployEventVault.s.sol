// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../src/engine/interfaces/IEventsEngine.sol";
import {IEngineLens} from "../src/engine/interfaces/IEngineLens.sol";
import {EventVault} from "../src/products/vault/EventVault.sol";
import {DeploymentWriter} from "./lib/DeploymentWriter.sol";

/// @notice Deploys the Trading Balance (S7, A.4.1) against the live engine and records the `vault` fragment.
///   forge script script/DeployEventVault.s.sol --rpc-url moderato --broadcast --slow \
///     --private-key <deployer-vault> --tempo.fee-token 0x20C0000000000000000000000000000000000000
///   tsx scripts/deploy/finalize.ts 42431 vault DeployEventVault.s.sol && pnpm codegen
/// The engine and lens come from `deployments/<chainId>/engine.json` (the venue pin); the collateral is the engine's
/// own. The constructor approves the engine once and opts the vault out of third-party cranks (D-015); both are
/// re-checked here after the broadcast. The vault has no owner and no admin surface.
contract DeployEventVault is DeploymentWriter {
    function run() external {
        string memory j = vm.readFile(string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), "/engine.json"));
        IEventsEngine engine = IEventsEngine(vm.parseJsonAddress(j, ".contracts.EventsEngine.address"));
        IEngineLens lens = IEngineLens(vm.parseJsonAddress(j, ".contracts.EngineLens.address"));
        require(address(engine).code.length > 0 && address(lens).code.length > 0, "engine not on this chain");
        require(lens.engine() == address(engine), "lens does not read this engine");
        IERC20 collateral = IERC20(engine.collateral());

        vm.startBroadcast();
        EventVault vault = new EventVault(collateral, engine, lens);
        vm.stopBroadcast();

        require(lens.crankOptedOut(address(vault)), "vault did not opt out of cranks");
        require(collateral.allowance(address(vault), address(engine)) == type(uint256).max, "engine not approved");

        recordContract("EventVault", address(vault), "EventVault.sol:EventVault", false);
        recordParam("engine", vm.toString(address(engine)));
        recordParam("lens", vm.toString(address(lens)));
        recordParam("collateral", vm.toString(address(collateral)));
        recordParam("iocMaxFills", 16);
        recordParam("iocMaxEvictions", 4);
        writePending("vault");
    }
}
