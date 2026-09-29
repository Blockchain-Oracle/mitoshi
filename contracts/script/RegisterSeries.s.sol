// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {DeploymentWriter} from "./lib/DeploymentWriter.sol";
import {EngineCheck} from "./lib/EngineCheck.sol";
import {EngineStorage} from "../src/engine/EngineStorage.sol";
import "../src/engine/EngineTypes.sol";

/// @notice S2.11, ensure-style: every Series in the venue spec exists with the spec's grid and launch policy version 0.
///         A missing Series is registered (admin key); an existing one that differs fails the run ("series drift").
contract RegisterSeries is DeploymentWriter, EngineCheck {
    function run() external {
        Spec memory s = spec();
        Deployed memory d = deployed();
        SeriesSpec[] memory all = seriesSpecs();
        for (uint256 i; i < all.length; ++i) {
            SeriesSpec memory x = all[i];
            bytes32 sid = EngineStorage.seriesIdOf(x.ticker, x.cadenceSec, x.basis);
            PolicyVersion memory want = launchPolicy(address(d.rs), x.feed, s, x.basis);
            if (_exists(d, sid)) {
                Series memory have = d.lens.seriesOf(sid);
                _drift(
                    have.lotBase == s.lotBase && have.tickBase == s.tickBase && have.minLots == s.minLots
                        && have.minRestSec == s.minRestSec && have.maxLeadSec == s.maxLeadSec && have.fillsCap == s.fillsCap
                        && have.evictionsCap == s.evictionsCap,
                    string.concat("series grid ", x.key)
                );
                _drift(have.versionCount >= 1, string.concat("series has no policy ", x.key));
                _drift(
                    keccak256(abi.encode(d.lens.policyOf(sid, 0))) == keccak256(abi.encode(want)),
                    string.concat("series policy v0 ", x.key)
                );
            } else {
                vm.startBroadcast();
                d.engine.registerSeries(
                    RegisterSeriesArgs(x.ticker, x.basis, x.cadenceSec, s.lotBase, s.tickBase, s.minLots, s.minRestSec, s.maxLeadSec, s.fillsCap, s.evictionsCap)
                );
                d.engine.addPolicyVersion(sid, 0, want);
                vm.stopBroadcast();
            }
            recordParam(string.concat("series.", x.key), vm.toString(sid));
        }
        recordContract("EventsEngine", address(d.engine), "EventsEngine.sol:EventsEngine", false);
        writePending("engine");
    }

    function _exists(Deployed memory d, bytes32 sid) private view returns (bool) {
        try d.lens.seriesOf(sid) returns (Series memory) {
            return true;
        } catch {
            return false;
        }
    }
}
