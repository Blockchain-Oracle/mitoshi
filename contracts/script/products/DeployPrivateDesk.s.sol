// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/script/DeployPrivateDesk.s.sol — the DreamDEX module and ERC-6909 pins become
// the engine + lens from `deployments/<chainId>/engine.json`; the desk key is the testnet `desk` role (`DESK_ADDRESS`,
// default `~/.config/cwf/<network>/desk.json`'s address — never the deployer); the address goes into the `private`
// fragment through `DeploymentWriter` + `scripts/deploy/finalize.ts`. Launch parameters are Masayume's (a 1–25 stake band
// per slot, no mints inside the last 60 s before lock).

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../src/engine/interfaces/IEventsEngine.sol";
import {IEngineLens} from "../../src/engine/interfaces/IEngineLens.sol";
import {IPrivateDesk} from "../../src/products/private/IPrivateDesk.sol";
import {PrivateDesk} from "../../src/products/private/PrivateDesk.sol";
import {DeploymentWriter} from "../lib/DeploymentWriter.sol";

/// @notice Deploys the private desk (S10d, A.4.4) against the live engine and records the `private` fragment.
///   DESK_ADDRESS=<desk role address> forge script script/products/DeployPrivateDesk.s.sol --rpc-url moderato \
///     --broadcast --slow --private-key <deployer-tickets> --tempo.fee-token 0x20C0000000000000000000000000000000000000
///   tsx scripts/deploy/finalize.ts 42431 private DeployPrivateDesk.s.sol && pnpm codegen
/// @dev The broadcaster is the admin (testnet single key, Q-016); `setDesk` rotates the desk key, `setParams` the band.
contract DeployPrivateDesk is DeploymentWriter {
    uint256 internal constant ONE = 1e6;

    function launchParams() public pure returns (IPrivateDesk.Params memory) {
        return IPrivateDesk.Params({minStake: ONE, maxStake: 25 * ONE, minTimeLeftSec: 60});
    }

    function run() external returns (PrivateDesk deskContract) {
        string memory root = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid));
        string memory j = vm.readFile(string.concat(root, "/engine.json"));
        IEventsEngine engine = IEventsEngine(vm.parseJsonAddress(j, ".contracts.EventsEngine.address"));
        IEngineLens lens = IEngineLens(vm.parseJsonAddress(j, ".contracts.EngineLens.address"));
        require(address(engine).code.length > 0 && address(lens).code.length > 0, "engine not on this chain");
        IERC20 collateral = IERC20(engine.collateral());
        address deskKey = vm.envAddress("DESK_ADDRESS");

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        require(deskKey != deployer, "the desk key is never the deployer");
        deskContract = new PrivateDesk(collateral, engine, lens, deskKey, launchParams());
        vm.stopBroadcast();

        require(lens.crankOptedOut(address(deskContract)), "desk did not opt out of cranks");
        require(collateral.allowance(address(deskContract), address(engine)) == type(uint256).max, "engine not approved");
        require(deskContract.admin() == deployer && deskContract.desk() == deskKey, "roles not set");
        IPrivateDesk.Params memory p = launchParams();
        recordContract("PrivateDesk", address(deskContract), "PrivateDesk.sol:PrivateDesk", false);
        recordParam("engine", vm.toString(address(engine)));
        recordParam("lens", vm.toString(address(lens)));
        recordParam("collateral", vm.toString(address(collateral)));
        recordParam("minStake", p.minStake);
        recordParam("maxStake", p.maxStake);
        recordParam("minTimeLeftSec", p.minTimeLeftSec);
        recordRole("ADMIN", deployer);
        recordRole("DESK", deskKey);
        writePending("private");
    }
}
