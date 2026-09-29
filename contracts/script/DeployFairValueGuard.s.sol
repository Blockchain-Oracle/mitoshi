// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";
import {IEngineLens} from "../src/engine/interfaces/IEngineLens.sol";
import {IPrintVerifier} from "../src/engine/interfaces/IPrintVerifier.sol";
import {FairValueGuard} from "../src/fair/FairValueGuard.sol";
import {DeploymentWriter} from "./lib/DeploymentWriter.sol";

/// @notice Deploys the PD-2 fair-value guard (S10.0, A.5.4) against the live engine and records the `fair` fragment.
///   forge script script/DeployFairValueGuard.s.sol --rpc-url moderato --broadcast --slow \
///     --private-key <deployer-products> --tempo.fee-token 0x20C0000000000000000000000000000000000000
///   tsx scripts/deploy/finalize.ts 42431 fair DeployFairValueGuard.s.sol && pnpm codegen
/// Lens and RedStone verifier come from `deployments/<chainId>/engine.json`; the Series, their tickers and feeds from
/// `packages/core/src/market/venue-spec.json`; σ and the spot age from `packages/core/src/fair/guard-spec.json`. The
/// broadcaster owns the guard (testnet single owner key, Q-016).
contract DeployFairValueGuard is DeploymentWriter {
    function run() external {
        string memory eng = vm.readFile(string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), "/engine.json"));
        IEngineLens lens = IEngineLens(vm.parseJsonAddress(eng, ".contracts.EngineLens.address"));
        IPrintVerifier rs = IPrintVerifier(vm.parseJsonAddress(eng, ".contracts.RedStonePrintVerifier.address"));
        require(address(lens).code.length > 0 && address(rs).code.length > 0, "engine not on this chain");
        string memory venue = vm.readFile(string.concat(vm.projectRoot(), "/../packages/core/src/market/venue-spec.json"));
        string memory spec = vm.readFile(string.concat(vm.projectRoot(), "/../packages/core/src/fair/guard-spec.json"));
        uint256 n = _count(spec);

        vm.startBroadcast();
        FairValueGuard guard = new FairValueGuard(lens, msg.sender, uint32(vm.parseJsonUint(spec, ".maxSpotAgeSec")));
        for (uint256 i; i < n; ++i) {
            (bytes32 sid, uint16 ticker, bytes32 feed, uint64 sigma) = _series(venue, spec, lens, i);
            guard.setSigma(sid, sigma);
            guard.setSpotSource(ticker, rs, feed);
        }
        vm.stopBroadcast();

        recordContract("FairValueGuard", address(guard), "FairValueGuard.sol:FairValueGuard", false);
        recordParam("lens", vm.toString(address(lens)));
        recordParam("spotVerifier", vm.toString(address(rs)));
        recordParam("maxSpotAgeSec", guard.maxSpotAgeSec());
        for (uint256 i; i < n; ++i) {
            (bytes32 sid,,, uint64 sigma) = _series(venue, spec, lens, i);
            require(guard.sigmaE8OfSeries(sid) == sigma, "sigma not set");
            recordParam(string.concat("sigmaE8.", vm.parseJsonString(spec, string.concat(".series[", vm.toString(i), "].key"))), sigma);
        }
        recordRole("owner", msg.sender);
        writePending("fair");
    }

    function _count(string memory spec) internal view returns (uint256 n) {
        while (vm.keyExistsJson(spec, string.concat(".series[", vm.toString(n), "]"))) ++n;
    }

    /// The guard spec's i-th Series joined to venue-spec by key: its id, ticker, RedStone feed and σ on its clock.
    function _series(string memory venue, string memory spec, IEngineLens lens, uint256 i)
        internal
        view
        returns (bytes32 sid, uint16 ticker, bytes32 feed, uint64 sigma)
    {
        string memory at = string.concat(".series[", vm.toString(i), "]");
        string memory key = vm.parseJsonString(spec, string.concat(at, ".key"));
        uint256 j;
        while (keccak256(bytes(vm.parseJsonString(venue, string.concat(".series[", vm.toString(j), "].key")))) != keccak256(bytes(key))) ++j;
        string memory v = string.concat(".series[", vm.toString(j), "]");
        ticker = uint16(vm.parseJsonUint(venue, string.concat(v, ".ticker")));
        sid = lens.seriesIdOf(ticker, uint32(vm.parseJsonUint(venue, string.concat(v, ".cadenceSec"))), uint8(vm.parseJsonUint(venue, string.concat(v, ".basis"))));
        feed = bytes32(bytes(vm.parseJsonString(venue, string.concat(v, ".redstoneFeed"))));
        bool calendar = keccak256(bytes(vm.parseJsonString(spec, string.concat(at, ".clock")))) == keccak256("calendar");
        uint256 year = vm.parseJsonUint(spec, calendar ? ".calendarYearSec" : ".tradingYearSec");
        uint256 bps = vm.parseJsonUint(spec, string.concat(at, ".sigmaBps"));
        sigma = uint64(FixedPointMathLib.sqrt(bps * bps * 1e8 / year));
    }
}
