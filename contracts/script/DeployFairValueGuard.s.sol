// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IEngineLens} from "../src/engine/interfaces/IEngineLens.sol";
import {IPrintVerifier} from "../src/engine/interfaces/IPrintVerifier.sol";
import {FairValueGuard} from "../src/fair/FairValueGuard.sol";
import {DeploymentWriter} from "./lib/DeploymentWriter.sol";
import {GuardSpec} from "./lib/GuardSpec.sol";

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
        uint256 n = GuardSpec.count(spec);

        vm.startBroadcast();
        FairValueGuard guard = new FairValueGuard(lens, msg.sender, uint32(vm.parseJsonUint(spec, ".maxSpotAgeSec")));
        for (uint256 i; i < n; ++i) {
            (bytes32 sid, uint16 ticker, string memory symbol, uint64 sigma) = GuardSpec.series(venue, spec, lens, i);
            guard.setSigma(sid, sigma);
            guard.setSpotSource(ticker, rs, GuardSpec.spotFeed(spec, symbol));
        }
        vm.stopBroadcast();

        recordContract("FairValueGuard", address(guard), "FairValueGuard.sol:FairValueGuard", false);
        recordParam("lens", vm.toString(address(lens)));
        recordParam("spotVerifier", vm.toString(address(rs)));
        recordParam("maxSpotAgeSec", guard.maxSpotAgeSec());
        for (uint256 i; i < n; ++i) {
            (bytes32 sid,,, uint64 sigma) = GuardSpec.series(venue, spec, lens, i);
            require(guard.sigmaE8OfSeries(sid) == sigma, "sigma not set");
            recordParam(string.concat("sigmaE8.", vm.parseJsonString(spec, string.concat(".series[", vm.toString(i), "].key"))), sigma);
        }
        recordRole("owner", msg.sender);
        writePending("fair");
    }
}
