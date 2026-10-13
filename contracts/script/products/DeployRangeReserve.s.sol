// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/script/DeployRangeReserve.s.sol — the DreamDEX module, OracleHub and venue pins
// become the engine + lens from `deployments/<chainId>/engine.json` and the PD-2 guard from `fair.json`; each asset is
// bound to its engine ticker from `packages/core/src/market/venue-spec.json` (`setAssetTicker`, in place of the hub's
// question key); the address goes into the `range` fragment through `DeploymentWriter` + `scripts/deploy/finalize.ts`.
// Launch parameters are Masayume's (the parlay's margin and caps, the centre read over 5 contracts (R4-5), a 2 %–97 % band,
// 2-day horizon, 6 h stale grace) plus the Tempo seam's (D-172): the D-109 rest at the grid's 20 s and a 2σ drift bound.
// Volatility: Masayume's measured BTC 6,200 and ETH 7,800 (per √s × 1e8); SOL, which Masayume never listed, takes the
// house maker's σ (guard-spec 8,000 bp a calendar year = 14,245, the guard's own) until measured.
// R4-5 (D-227): every venue-spec symbol gets its ticker (the 9 stocks too); an asset with no reserve σ prices on the
// guard's σ for the Window's Series (`RangePricing._sigma`), so stocks and every cadence the guard models are offered.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../src/engine/interfaces/IEventsEngine.sol";
import {IEngineLens} from "../../src/engine/interfaces/IEngineLens.sol";
import {FairValueGuard} from "../../src/fair/FairValueGuard.sol";
import {IRangeReserve} from "../../src/products/range/IRangeReserve.sol";
import {RangeReserve} from "../../src/products/range/RangeReserve.sol";
import {DeploymentWriter} from "../lib/DeploymentWriter.sol";

/// @notice Deploys the range reserve (S10b, A.4.7) against the live engine and guard and records the `range` fragment.
///   forge script script/products/DeployRangeReserve.s.sol --rpc-url moderato --broadcast --slow \
///     --private-key <deployer-tickets> --tempo.fee-token 0x20C0000000000000000000000000000000000000
///   tsx scripts/deploy/finalize.ts 42431 range DeployRangeReserve.s.sol && pnpm codegen
/// @dev The broadcaster is the admin (testnet single key, Q-016). `setParams`/`setVolatility`/`setAssetTicker` tune it.
contract DeployRangeReserve is DeploymentWriter {
    uint256 internal constant ONE = 1e6;

    function launchParams() public pure returns (IRangeReserve.Params memory) {
        return IRangeReserve.Params({
            marginBps: 1_200,
            maxExposureBps: 6_000,
            maxSpreadRaw: 200_000,
            // R4-5 (D-227): the house maker rests 5 contracts a side on every lane (seed-maker MM_QUOTE_LOTS 5,000),
            // so the centre is read over the depth the books hold; the 2σ drift bound against a signed spot still refuses
            // a centre that has parted from the market. (Masayume's 20 left every stock Window ThinBook.)
            centerDepthRaw: 5 * ONE,
            minCenterQE6: 30_000,
            maxCenterQE6: 970_000,
            minProbRaw: 20_000,
            maxProbRaw: 970_000,
            minTimeLeftSec: 60,
            maxHorizonSec: 2 days,
            staleAfterSec: 6 hours,
            maxPayoutCap: 500 * ONE,
            maxExpiryLocked: 1_000 * ONE,
            minRestSec: 20,
            maxDriftE4: 20_000
        });
    }

    function launchVolatility() public pure returns (string[3] memory assets, uint64[3] memory sigmaE8) {
        assets = ["BTC", "ETH", "SOL"];
        sigmaE8 = [uint64(6_200), uint64(7_800), uint64(14_245)];
    }

    function run() external returns (RangeReserve reserve) {
        string memory root = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid));
        string memory j = vm.readFile(string.concat(root, "/engine.json"));
        IEventsEngine engine = IEventsEngine(vm.parseJsonAddress(j, ".contracts.EventsEngine.address"));
        IEngineLens lens = IEngineLens(vm.parseJsonAddress(j, ".contracts.EngineLens.address"));
        FairValueGuard guard = FairValueGuard(vm.parseJsonAddress(vm.readFile(string.concat(root, "/fair.json")), ".contracts.FairValueGuard.address"));
        require(address(engine).code.length > 0 && address(lens).code.length > 0 && address(guard).code.length > 0, "venue not on this chain");
        IERC20 collateral = IERC20(engine.collateral());
        (string[3] memory assets, uint64[3] memory sigmas) = launchVolatility();
        (string[] memory symbols, uint16[] memory symbolTickers) = venueAssets();

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        reserve = new RangeReserve(collateral, engine, lens, guard, launchParams());
        for (uint256 i; i < 3; ++i) reserve.setVolatility(assets[i], sigmas[i]);
        for (uint256 i; i < symbols.length; ++i) reserve.setAssetTicker(symbols[i], symbolTickers[i]);
        vm.stopBroadcast();

        require(lens.crankOptedOut(address(reserve)), "reserve did not opt out of cranks");
        require(reserve.admin() == deployer && address(reserve.guard()) == address(guard), "roles not set");
        IRangeReserve.Params memory p = launchParams();
        recordContract("RangeReserve", address(reserve), "RangeReserve.sol:RangeReserve", false);
        recordParam("engine", vm.toString(address(engine)));
        recordParam("lens", vm.toString(address(lens)));
        recordParam("guard", vm.toString(address(guard)));
        recordParam("collateral", vm.toString(address(collateral)));
        recordParam("marginBps", p.marginBps);
        recordParam("maxExposureBps", p.maxExposureBps);
        recordParam("maxSpreadRaw", p.maxSpreadRaw);
        recordParam("centerDepthRaw", p.centerDepthRaw);
        recordParam("minCenterQE6", p.minCenterQE6);
        recordParam("maxCenterQE6", p.maxCenterQE6);
        recordParam("minProbRaw", p.minProbRaw);
        recordParam("maxProbRaw", p.maxProbRaw);
        recordParam("minTimeLeftSec", p.minTimeLeftSec);
        recordParam("maxHorizonSec", p.maxHorizonSec);
        recordParam("staleAfterSec", p.staleAfterSec);
        recordParam("maxPayoutCap", p.maxPayoutCap);
        recordParam("maxExpiryLocked", p.maxExpiryLocked);
        recordParam("minRestSec", p.minRestSec);
        recordParam("maxDriftE4", p.maxDriftE4);
        for (uint256 i; i < 3; ++i) {
            require(reserve.volatilityOf(keccak256(bytes(assets[i]))) == sigmas[i], "sigma not set");
            recordParam(string.concat("sigmaE8.", assets[i]), sigmas[i]);
        }
        for (uint256 i; i < symbols.length; ++i) {
            require(reserve.tickerOf(keccak256(bytes(symbols[i]))) == symbolTickers[i], "ticker not set");
            recordParam(string.concat("ticker.", symbols[i]), symbolTickers[i]);
        }
        recordRole("ADMIN", deployer);
        writePending("range");
    }

    /// Every venue-spec symbol once, with its engine ticker (a symbol keeps one ticker across its lanes).
    function venueAssets() public view returns (string[] memory symbols, uint16[] memory tickers) {
        string memory venue = vm.readFile(string.concat(vm.projectRoot(), "/../packages/core/src/market/venue-spec.json"));
        uint256 n;
        while (vm.keyExistsJson(venue, string.concat(".series[", vm.toString(n), "]"))) ++n;
        string[] memory all = new string[](n);
        uint16[] memory allTickers = new uint16[](n);
        uint256 count;
        for (uint256 i; i < n; ++i) {
            string memory at = string.concat(".series[", vm.toString(i), "]");
            string memory symbol = vm.parseJsonString(venue, string.concat(at, ".symbol"));
            bool seen;
            for (uint256 j; j < count && !seen; ++j) seen = keccak256(bytes(all[j])) == keccak256(bytes(symbol));
            if (seen) continue;
            all[count] = symbol;
            allTickers[count++] = uint16(vm.parseJsonUint(venue, string.concat(at, ".ticker")));
        }
        symbols = new string[](count);
        tickers = new uint16[](count);
        for (uint256 i; i < count; ++i) (symbols[i], tickers[i]) = (all[i], allTickers[i]);
    }

    /// The engine ticker of the venue-spec Series `key` (e.g. "BTC-5m").
    function tickerOf(string memory key) public view returns (uint16 ticker) {
        string memory venue = vm.readFile(string.concat(vm.projectRoot(), "/../packages/core/src/market/venue-spec.json"));
        for (uint256 i; vm.keyExistsJson(venue, string.concat(".series[", vm.toString(i), "]")); ++i) {
            string memory at = string.concat(".series[", vm.toString(i), "]");
            if (keccak256(bytes(vm.parseJsonString(venue, string.concat(at, ".key")))) == keccak256(bytes(key))) {
                return uint16(vm.parseJsonUint(venue, string.concat(at, ".ticker")));
            }
        }
        revert(string.concat("no venue-spec Series ", key));
    }
}
