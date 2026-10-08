// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {IEngineLens} from "../src/engine/interfaces/IEngineLens.sol";
import {IPrintVerifier} from "../src/engine/interfaces/IPrintVerifier.sol";
import {FairValueGuard} from "../src/fair/FairValueGuard.sol";
import {GuardSpec} from "./lib/GuardSpec.sol";

/// @notice Brings the deployed FairValueGuard to `guard-spec.json` (S24.1, D-193): σ for every Series on the venue and one
///         RedStone spot source per ticker. Only what differs is sent; every value is re-read after. The guard's owner
///         (`deployer-products` on testnet, Q-016) broadcasts:
///   forge script script/SetGuardModels.s.sol --rpc-url moderato --broadcast --slow \
///     --private-key <deployer-products> --tempo.fee-token 0x20C0000000000000000000000000000000000000
contract SetGuardModels is Script {
    function run() external {
        string memory root = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid));
        string memory eng = vm.readFile(string.concat(root, "/engine.json"));
        IEngineLens lens = IEngineLens(vm.parseJsonAddress(eng, ".contracts.EngineLens.address"));
        IPrintVerifier rs = IPrintVerifier(vm.parseJsonAddress(eng, ".contracts.RedStonePrintVerifier.address"));
        FairValueGuard guard = FairValueGuard(vm.parseJsonAddress(vm.readFile(string.concat(root, "/fair.json")), ".contracts.FairValueGuard.address"));
        string memory venue = vm.readFile(string.concat(vm.projectRoot(), "/../packages/core/src/market/venue-spec.json"));
        string memory spec = vm.readFile(string.concat(vm.projectRoot(), "/../packages/core/src/fair/guard-spec.json"));
        uint256 n = GuardSpec.count(spec);
        uint256 sigmas;
        uint256 sources;

        vm.startBroadcast();
        for (uint256 i; i < n; ++i) {
            (bytes32 sid, uint16 ticker, string memory symbol, uint64 sigma) = GuardSpec.series(venue, spec, lens, i);
            if (guard.sigmaE8OfSeries(sid) != sigma) {
                guard.setSigma(sid, sigma);
                ++sigmas;
            }
            bytes32 feed = GuardSpec.spotFeed(spec, symbol);
            (IPrintVerifier have, bytes32 haveFeed) = guard.spotSourceOf(ticker);
            if (address(have) != address(rs) || haveFeed != feed) {
                guard.setSpotSource(ticker, rs, feed);
                ++sources;
            }
        }
        vm.stopBroadcast();

        for (uint256 i; i < n; ++i) {
            (bytes32 sid, uint16 ticker, string memory symbol, uint64 sigma) = GuardSpec.series(venue, spec, lens, i);
            require(guard.sigmaE8OfSeries(sid) == sigma, "sigma not set");
            (IPrintVerifier have, bytes32 haveFeed) = guard.spotSourceOf(ticker);
            require(address(have) == address(rs) && haveFeed == GuardSpec.spotFeed(spec, symbol), "spot source not set");
        }
        console2.log("series", n, "sigmas set", sigmas);
        console2.log("spot sources set", sources);
    }
}
