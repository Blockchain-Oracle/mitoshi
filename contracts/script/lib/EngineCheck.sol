// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GapPolicy} from "./GapPolicy.sol";
import {Script} from "forge-std/Script.sol";
import {EventsEngine} from "../../src/engine/EventsEngine.sol";
import {EngineLens} from "../../src/engine/EngineLens.sol";
import {RedStonePrintVerifier} from "../../src/engine/verifiers/RedStonePrintVerifier.sol";
import {DataStreamsPrintVerifier} from "../../src/engine/verifiers/DataStreamsPrintVerifier.sol";
import {AttestedPrintVerifier} from "../../src/engine/verifiers/AttestedPrintVerifier.sol";
import "../../src/engine/EngineTypes.sol";

/// @notice The venue spec (`packages/core/src/market/venue-spec.json`), the recorded engine fragment, and the drift
///         checks every engine script runs: a deployed venue that differs from the spec fails loudly, never "fixes".
abstract contract EngineCheck is Script {
    struct Spec {
        address collateral;
        address[] redstoneSigners;
        uint8 redstoneThreshold;
        uint32 strictSec;
        uint32 admissionSec;
        address dataStreamsProxy;
        uint64 lotBase;
        uint64 tickBase;
        uint64 minLots;
        uint32 minRestSec;
        uint32 maxLeadSec;
        uint8 fillsCap;
        uint8 evictionsCap;
        uint32 nodesReserved;
        /// S6 (D-217): the check window and its RedStone strictness, the Data Streams grace, and whether this chain's Gap
        /// Series take Data Streams (`dataStreams.gapChains`).
        uint32 checkAdmissionSec;
        uint16 maxDivergenceBps;
        uint32 checkStrictSec;
        uint16 dataStreamsGraceSec;
        bool gapOnDataStreams;
    }

    struct SeriesSpec {
        string key;
        uint16 ticker;
        uint8 basis;
        uint32 cadenceSec;
        bytes32 feed;
        string symbol;
    }

    struct Deployed {
        EventsEngine engine;
        EngineLens lens;
        RedStonePrintVerifier rs;
        DataStreamsPrintVerifier ds;
        AttestedPrintVerifier att;
    }

    function specJson() internal view returns (string memory) {
        return vm.readFile(string.concat(vm.projectRoot(), "/../packages/core/src/market/venue-spec.json"));
    }

    function spec() internal view returns (Spec memory s) {
        string memory j = specJson();
        s.collateral = vm.parseJsonAddress(j, ".collateral");
        s.redstoneSigners = vm.parseJsonAddressArray(j, ".redstone.signers");
        s.redstoneThreshold = uint8(vm.parseJsonUint(j, ".redstone.threshold"));
        s.strictSec = uint32(vm.parseJsonUint(j, ".redstone.strictSec"));
        s.admissionSec = uint32(vm.parseJsonUint(j, ".redstone.admissionSec"));
        s.dataStreamsProxy = vm.parseJsonAddress(j, string.concat(".dataStreams.proxy.", vm.toString(block.chainid)));
        s.lotBase = uint64(vm.parseJsonUint(j, ".grid.lotBase"));
        s.tickBase = uint64(vm.parseJsonUint(j, ".grid.tickBase"));
        s.minLots = uint64(vm.parseJsonUint(j, ".grid.minLots"));
        s.minRestSec = uint32(vm.parseJsonUint(j, ".grid.minRestSec"));
        s.maxLeadSec = uint32(vm.parseJsonUint(j, ".grid.maxLeadSec"));
        s.fillsCap = uint8(vm.parseJsonUint(j, ".grid.fillsCap"));
        s.evictionsCap = uint8(vm.parseJsonUint(j, ".grid.evictionsCap"));
        s.nodesReserved = uint32(vm.parseJsonUint(j, ".nodesReserved"));
        s.checkAdmissionSec = uint32(vm.parseJsonUint(j, ".check.admissionSec"));
        s.maxDivergenceBps = uint16(vm.parseJsonUint(j, ".check.maxDivergenceBps"));
        s.checkStrictSec = uint32(vm.parseJsonUint(j, ".check.redstoneStrictSec"));
        s.dataStreamsGraceSec = uint16(vm.parseJsonUint(j, ".dataStreams.graceSec"));
        string[] memory chains = vm.parseJsonStringArray(j, ".dataStreams.gapChains");
        for (uint256 i; i < chains.length; ++i) if (vm.parseUint(chains[i]) == block.chainid) s.gapOnDataStreams = true;
    }

    function seriesSpecs() internal view returns (SeriesSpec[] memory out) {
        string memory j = specJson();
        uint256 n;
        while (vm.keyExistsJson(j, string.concat(".series[", vm.toString(n), "]"))) ++n;
        out = new SeriesSpec[](n);
        for (uint256 i; i < n; ++i) {
            string memory k = string.concat(".series[", vm.toString(i), "]");
            out[i] = SeriesSpec(
                vm.parseJsonString(j, string.concat(k, ".key")),
                uint16(vm.parseJsonUint(j, string.concat(k, ".ticker"))),
                uint8(vm.parseJsonUint(j, string.concat(k, ".basis"))),
                uint32(vm.parseJsonUint(j, string.concat(k, ".cadenceSec"))),
                bytes32(bytes(vm.parseJsonString(j, string.concat(k, ".redstoneFeed")))),
                vm.parseJsonString(j, string.concat(k, ".symbol"))
            );
        }
    }

    function fragmentPath() internal view returns (string memory) {
        return string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), "/engine.json");
    }

    /// The recorded venue; reverts when there is none (run DeployEngine first).
    function deployed() internal view returns (Deployed memory d) {
        string memory j = vm.readFile(fragmentPath());
        d.engine = EventsEngine(vm.parseJsonAddress(j, ".contracts.EventsEngine.address"));
        d.lens = EngineLens(vm.parseJsonAddress(j, ".contracts.EngineLens.address"));
        d.rs = RedStonePrintVerifier(vm.parseJsonAddress(j, ".contracts.RedStonePrintVerifier.address"));
        d.ds = DataStreamsPrintVerifier(vm.parseJsonAddress(j, ".contracts.DataStreamsPrintVerifier.address"));
        d.att = AttestedPrintVerifier(vm.parseJsonAddress(j, ".contracts.AttestedPrintVerifier.address"));
    }

    function checkEngine(
        EventsEngine engine,
        EngineLens lens,
        RedStonePrintVerifier rs,
        DataStreamsPrintVerifier ds,
        AttestedPrintVerifier att,
        Spec memory s,
        address admin,
        address treasury,
        address roller,
        address attestor
    ) internal view {
        _drift(address(engine).code.length != 0, "engine has no code");
        _drift(engine.collateral() == s.collateral, "engine collateral");
        _drift(engine.treasury() == treasury, "engine treasury");
        _drift(lens.engine() == address(engine), "lens engine");
        _drift(lens.admin() == admin, "engine admin");
        _drift(lens.isRoller(roller), "roller not granted");
        address[] memory signers = rs.signers();
        _drift(signers.length == s.redstoneSigners.length && rs.threshold() == s.redstoneThreshold, "RedStone signer set");
        for (uint256 i; i < signers.length; ++i) _drift(signers[i] == s.redstoneSigners[i], "RedStone signer");
        _drift(address(ds.proxy()) == s.dataStreamsProxy, "Data Streams proxy");
        address[] memory a = att.attestors();
        _drift(a.length == 1 && a[0] == attestor, "attestor set");
    }

    /// The launch policy for a Series: RedStone primary at the spec's strict and admission windows, no check source
    /// (Data Streams needs credentials on Moderato, Q-011), valid from 0, open-ended.
    /// @notice Version 0 of a Series: RedStone primary, no check (testnet, Q-011). A Gap admits its Friday open print
    ///         until the lock (`ADMIT_UNTIL_LOCK`, A.1.2; Agari `policyVersions(…, "gap")`).
    function launchPolicy(address rs, bytes32 feed, Spec memory s, uint8 basis) internal pure returns (PolicyVersion memory v) {
        v.validFrom = 0;
        v.validUntil = OPEN_ENDED;
        v.primary.verifier = rs;
        v.primary.source = SOURCE_REDSTONE;
        v.primary.feedId = feed;
        v.primary.strictSec = s.strictSec;
        v.primary.openAdmissionSec = basis == BASIS_GAP ? ADMIT_UNTIL_LOCK : s.admissionSec;
        v.primary.closeAdmissionSec = s.admissionSec;
    }

    /// Version 0 of a Series: the Gap on Data Streams with a RedStone check where this chain configures it (D-217),
    /// every other Series (and every Gap elsewhere) on `launchPolicy`.
    function seriesPolicy(Deployed memory d, SeriesSpec memory x, Spec memory s) internal view returns (PolicyVersion memory) {
        if (x.basis != BASIS_GAP || !s.gapOnDataStreams) return launchPolicy(address(d.rs), x.feed, s, x.basis);
        return GapPolicy.dataStreamsPrimary(
            GapPolicy.Params({
                dataStreams: address(d.ds),
                dataStreamsFeed: vm.parseJsonBytes32(specJson(), string.concat(".dataStreams.feeds.", x.symbol)),
                graceSec: s.dataStreamsGraceSec,
                redstone: address(d.rs),
                redstoneFeed: x.feed,
                strictSec: s.checkStrictSec,
                admissionSec: s.admissionSec,
                checkAdmissionSec: s.checkAdmissionSec,
                maxDivergenceBps: s.maxDivergenceBps
            })
        );
    }

    function _drift(bool ok, string memory what) internal pure {
        if (!ok) revert(string.concat("engine drift: ", what));
    }
}
