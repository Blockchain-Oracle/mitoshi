// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/script/DeployMarketMakerVault.s.sol — the DreamDEX module/outcome-token pins
// become the engine + lens from `deployments/<chainId>/engine.json` (the venue pin), the collateral is the engine's
// own, and the address goes into the `maker` fragment through `DeploymentWriter` + `scripts/deploy/finalize.ts`.
// Launch parameters unchanged.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../src/engine/interfaces/IEventsEngine.sol";
import {IEngineLens} from "../src/engine/interfaces/IEngineLens.sol";
import {IMarketMakerVault} from "../src/products/maker/IMarketMakerVault.sol";
import {MarketMakerVault} from "../src/products/maker/MarketMakerVault.sol";
import {DeploymentWriter} from "./lib/DeploymentWriter.sol";

/// @notice Deploys the Earn maker vault (S8, A.4.2) against the live engine, names the maker key (`MAKER_ADDRESS`,
///         default: the deployer, until S4's earn-quoter key takes over by `setMaker`) and records the `maker` fragment.
///   forge script script/DeployMarketMakerVault.s.sol --rpc-url moderato --broadcast --slow \
///     --private-key <deployer-maker> --tempo.fee-token 0x20C0000000000000000000000000000000000000
///   tsx scripts/deploy/finalize.ts 42431 maker DeployMarketMakerVault.s.sol && pnpm codegen
/// @dev Launch parameters: the bot kit's maker (spread ±0.02, 5 contracts) widened to the vault's doctrine — a pair
///      must leave 0.02 of a set uncovered, no bid outside 0.05–0.95, 20 contracts a side, 200 collateral deployed per
///      Window, 60% of value at most, eight Windows, no quotes inside the last 45 s before lock. `setParams` /
///      `setMaker` tune them later without a redeploy.
contract DeployMarketMakerVault is DeploymentWriter {
    uint256 internal constant ONE = 1e6;

    function launchParams() public pure returns (IMarketMakerVault.Params memory) {
        return IMarketMakerVault.Params({
            maxExposureBps: 6_000,
            minSpreadRaw: 20_000,
            minPriceRaw: 50_000,
            maxPriceRaw: 950_000,
            maxQuantityRaw: 20 * ONE,
            maxWindowDeployed: 200 * ONE,
            maxOpenWindows: 8,
            minTimeLeftSec: 45
        });
    }

    function run() external returns (MarketMakerVault vault) {
        string memory j = vm.readFile(string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), "/engine.json"));
        IEventsEngine engine = IEventsEngine(vm.parseJsonAddress(j, ".contracts.EventsEngine.address"));
        IEngineLens lens = IEngineLens(vm.parseJsonAddress(j, ".contracts.EngineLens.address"));
        require(address(engine).code.length > 0 && address(lens).code.length > 0, "engine not on this chain");
        require(lens.engine() == address(engine), "lens does not read this engine");
        IERC20 collateral = IERC20(engine.collateral());

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        address makerKey = vm.envOr("MAKER_ADDRESS", deployer);
        vault = new MarketMakerVault(collateral, engine, lens, launchParams());
        vault.setMaker(makerKey);
        vm.stopBroadcast();

        require(lens.crankOptedOut(address(vault)), "vault did not opt out of cranks");
        require(collateral.allowance(address(vault), address(engine)) == type(uint256).max, "engine not approved");
        require(vault.maker() == makerKey && vault.admin() == deployer, "roles not set");

        IMarketMakerVault.Params memory p = launchParams();
        recordContract("MarketMakerVault", address(vault), "MarketMakerVault.sol:MarketMakerVault", false);
        recordParam("engine", vm.toString(address(engine)));
        recordParam("lens", vm.toString(address(lens)));
        recordParam("collateral", vm.toString(address(collateral)));
        recordParam("maxExposureBps", p.maxExposureBps);
        recordParam("minSpreadRaw", p.minSpreadRaw);
        recordParam("minPriceRaw", p.minPriceRaw);
        recordParam("maxPriceRaw", p.maxPriceRaw);
        recordParam("maxQuantityRaw", p.maxQuantityRaw);
        recordParam("maxWindowDeployed", p.maxWindowDeployed);
        recordParam("maxOpenWindows", p.maxOpenWindows);
        recordParam("minTimeLeftSec", p.minTimeLeftSec);
        recordParam("postOnlyMaxEvictions", 4);
        recordRole("ADMIN", deployer);
        recordRole("MAKER", makerKey);
        writePending("maker");
    }
}
