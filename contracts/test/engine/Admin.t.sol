// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineFixture} from "./harness/EngineFixture.sol";
import {IEngineErrors as E} from "../../src/engine/EngineErrors.sol";
import {IEventsEngineEvents as Ev} from "../../src/engine/interfaces/IEventsEngineEvents.sol";
import {EngineStorage} from "../../src/engine/EngineStorage.sol";
import {EventsEngine} from "../../src/engine/EventsEngine.sol";
import {RedStonePrintVerifier} from "../../src/engine/verifiers/RedStonePrintVerifier.sol";
import {AttestedPrintVerifier} from "../../src/engine/verifiers/AttestedPrintVerifier.sol";
import {DataStreamsPrintVerifier} from "../../src/engine/verifiers/DataStreamsPrintVerifier.sol";
import {DataStreamsProxyStub} from "./harness/DataStreamsProxyStub.sol";
import {PrintSigner} from "./harness/PrintSigner.sol";
import {Policies} from "./harness/Policies.sol";
import "../../src/engine/EngineTypes.sol";

/// E-06/E-20…E-23: a constructor-bound admin with a two-step transfer, roller grants, and an immutable collateral.
contract AdminRolesTest is EngineFixture {
    function test_roles() public {
        address roller = makeAddr("roller");
        vm.expectRevert(E.NotAdmin.selector);
        engine.setRoller(roller, true);
        vm.prank(admin);
        vm.expectEmit(true, false, false, true, address(engine));
        emit Ev.RollerSet(roller, true);
        engine.setRoller(roller, true);
        bytes32 slot = keccak256(abi.encode(roller, uint256(EngineStorage.SLOT) + EngineStorage.OFF_IS_ROLLER));
        assertEq(uint256(engine.extsload(slot)), 1);
        vm.prank(admin);
        engine.setRoller(roller, false);
        assertEq(uint256(engine.extsload(slot)), 0);
    }

    function test_twoStepAdmin() public {
        address next = makeAddr("next-admin");
        vm.prank(admin);
        engine.transferAdmin(next);
        vm.expectRevert(E.NotAdmin.selector);
        engine.acceptAdmin();
        vm.prank(admin);
        vm.expectRevert(E.NotAdmin.selector);
        engine.acceptAdmin();
        vm.prank(next);
        vm.expectEmit(true, true, false, false, address(engine));
        emit Ev.AdminTransferred(admin, next);
        engine.acceptAdmin();
        vm.prank(admin);
        vm.expectRevert(E.NotAdmin.selector);
        engine.setRoller(admin, true);
        vm.prank(next);
        engine.setRoller(admin, true);
        vm.prank(next);
        vm.expectRevert(E.NotAdmin.selector);
        engine.acceptAdmin(); // nothing pending
    }

    function test_constructorRefusesZeroes() public {
        vm.expectRevert(E.InvalidOrderArgs.selector);
        new EventsEngine(address(0), admin, treasury);
        vm.expectRevert(E.InvalidOrderArgs.selector);
        new EventsEngine(address(usd), address(0), treasury);
        vm.expectRevert(E.InvalidOrderArgs.selector);
        new EventsEngine(address(usd), admin, address(0));
    }
}

/// E-07/E-23 series registration and E-08/E-09/E-25 policy versions (Agari admin_series.rs + policy_rules.rs tests).
contract AdminSeriesTest is EngineFixture {
    RedStonePrintVerifier internal rs;
    AttestedPrintVerifier internal att;
    DataStreamsPrintVerifier internal ds;
    bytes32 internal sid;

    function setUp() public override {
        super.setUp();
        rs = rsVerifier;
        att = attVerifier;
        ds = new DataStreamsPrintVerifier(address(new DataStreamsProxyStub()));
        sid = _register(BASIS_REGULAR, 300);
    }

    function _args(uint8 basis, uint32 cadence) internal pure returns (RegisterSeriesArgs memory) {
        return RegisterSeriesArgs(7, basis, cadence, 1000, 1000, 1000, 20, 400_000, 16, 16);
    }

    function _register(uint8 basis, uint32 cadence) internal returns (bytes32) {
        vm.prank(admin);
        return engine.registerSeries(_args(basis, cadence));
    }

    function _add(uint8 index, PolicyVersion memory v) internal {
        vm.prank(admin);
        engine.addPolicyVersion(sid, index, v);
    }

    function _refused(PolicyVersion memory v, string memory why) internal {
        vm.prank(admin);
        vm.expectRevert(E.BadPolicy.selector);
        engine.addPolicyVersion(sid, 0, v);
        why;
    }

    function test_registerSeriesChecks() public {
        assertEq(sid, keccak256(abi.encode(uint16(7), uint32(300), uint8(BASIS_REGULAR))));
        bytes32 slot = keccak256(abi.encode(sid, uint256(EngineStorage.SLOT) + EngineStorage.OFF_SERIES_IDX_OF));
        assertEq(uint256(engine.extsload(slot)), 2, "1-based; the fixture's own series is 1");
        vm.startPrank(admin);
        vm.expectRevert(E.SeriesExists.selector);
        engine.registerSeries(_args(BASIS_REGULAR, 300));
        uint32[5] memory badCadence = [uint32(0), 59, 90, 420, 7_200];
        for (uint256 i; i < 5; ++i) {
            vm.expectRevert(E.BadAlignment.selector);
            engine.registerSeries(_args(BASIS_REGULAR, badCadence[i]));
        }
        vm.expectRevert(E.BadAlignment.selector);
        engine.registerSeries(_args(BASIS_GAP, 300));
        vm.expectRevert(E.BadAlignment.selector);
        engine.registerSeries(_args(3, 300));
        engine.registerSeries(_args(BASIS_GAP, GAP_CADENCE_SEC));
        engine.registerSeries(_args(BASIS_TOKEN_24X7, 3_600));
        RegisterSeriesArgs memory a = _args(BASIS_REGULAR, 60);
        a.lotBase = 1;
        vm.expectRevert(E.BadGrid.selector);
        engine.registerSeries(a);
        a = _args(BASIS_REGULAR, 60);
        a.minLots = 0;
        vm.expectRevert(E.BadGrid.selector);
        engine.registerSeries(a);
        a = _args(BASIS_REGULAR, 60);
        a.fillsCap = 33;
        vm.expectRevert(E.BadSeriesParams.selector);
        engine.registerSeries(a);
        a.fillsCap = 0;
        vm.expectRevert(E.BadSeriesParams.selector);
        engine.registerSeries(a);
        a.fillsCap = 16;
        a.evictionsCap = 17;
        vm.expectRevert(E.BadSeriesParams.selector);
        engine.registerSeries(a);
        a.evictionsCap = 16;
        a.maxLeadSec = 0;
        vm.expectRevert(E.BadSeriesParams.selector);
        engine.registerSeries(a);
        vm.stopPrank();
        vm.expectRevert(E.NotAdmin.selector);
        engine.registerSeries(_args(BASIS_REGULAR, 60));
    }

    function test_acceptsTheLaunchVersions() public {
        PolicyVersion memory v1 = Policies.launch(address(rs), START, START + 86_400);
        _add(0, v1);
        PolicyVersion memory v2 = Policies.checked(Policies.launch(address(rs), START + 86_400, OPEN_ENDED), Policies.attested(address(att), 120));
        _add(1, v2);
        PolicyVersion memory v3 = Policies.checked(Policies.launch(address(rs), START, OPEN_ENDED), Policies.dataStreams(address(ds), 120));
        _add(2, v3);
        vm.prank(admin);
        bytes32 gap = engine.registerSeries(_args(BASIS_GAP, GAP_CADENCE_SEC));
        PolicyVersion memory g = Policies.launch(address(rs), START, OPEN_ENDED);
        g.primary.openAdmissionSec = ADMIT_UNTIL_LOCK;
        vm.prank(admin);
        engine.addPolicyVersion(gap, 0, g);
    }

    function test_policyValidation() public {
        PolicyVersion memory base = Policies.launch(address(rs), START, OPEN_ENDED);
        PolicyVersion memory v = base;
        v.validUntil = v.validFrom;
        _refused(v, "empty validity range");
        v = Policies.launch(address(rs), START, OPEN_ENDED);
        v.primary.openAdmissionSec = ADMIT_UNTIL_LOCK;
        _refused(v, "ADMIT_UNTIL_LOCK is Gap-only");
        v = Policies.launch(address(rs), START, OPEN_ENDED);
        v.primary.closeAdmissionSec = ADMIT_UNTIL_LOCK;
        _refused(v, "close admission never until-lock");
        v = Policies.launch(address(rs), START, OPEN_ENDED);
        v.primary.feedId = bytes32(0);
        _refused(v, "zero feed");
        v = Policies.launch(address(rs), START, OPEN_ENDED);
        v.primary.feedId = bytes32(uint256(1));
        _refused(v, "RedStone feed ids are left-aligned ASCII");
        v = Policies.launch(address(rs), START, OPEN_ENDED);
        v.primary.strictSec = 0;
        _refused(v, "strict window required");
        v = Policies.launch(address(att), START, OPEN_ENDED);
        _refused(v, "the verifier must prove the policy's source");
        v = Policies.launch(makeAddr("eoa"), START, OPEN_ENDED);
        _refused(v, "a verifier with no code");
        for (uint8 s = 0; s < 4; s += 1) {
            if (s == SOURCE_REDSTONE) continue;
            v = Policies.launch(address(rs), START, OPEN_ENDED);
            v.primary.source = s;
            _refused(v, "none and the reserved Pyth/Switchboard ids");
        }
        v = Policies.checked(Policies.launch(address(rs), START, OPEN_ENDED), Policies.redstone(address(rs), 120, 60));
        _refused(v, "check source must differ from the primary");
        v = Policies.checked(Policies.launch(address(rs), START, OPEN_ENDED), Policies.attested(address(att), 121));
        _refused(v, "check admissions equal checkAdmissionSec");
        v = Policies.launch(address(rs), START, OPEN_ENDED);
        v.maxDivergenceBps = 25;
        _refused(v, "no check means no divergence bound");
        v = Policies.checked(Policies.launch(address(rs), START, OPEN_ENDED), Policies.attested(address(att), 120));
        v.maxDivergenceBps = 0;
        _refused(v, "a check needs a divergence bound");
        PrintPolicy memory dsBad = Policies.dataStreams(address(ds), 120);
        dsBad.feedId = bytes32(uint256(dsBad.feedId) & ~(uint256(0xffff) << 240) | (uint256(4) << 240));
        _refused(Policies.checked(Policies.launch(address(rs), START, OPEN_ENDED), dsBad), "report version 3 or 11");
        dsBad = Policies.dataStreams(address(ds), 120);
        dsBad.statusMask = 0;
        _refused(Policies.checked(Policies.launch(address(rs), START, OPEN_ENDED), dsBad), "a market-status mask");
        PolicyVersion memory rsCheck = Policies.checked(Policies.launch(address(att), START, OPEN_ENDED), Policies.redstone(address(rs), 120, 120));
        rsCheck.primary = Policies.attested(address(att), 900);
        _refused(rsCheck, "D-013: RedStone check strict must be below the check window");
        rsCheck.check.strictSec = 60;
        _add(0, rsCheck);
    }

    function test_policyVersionsAppendOnly() public {
        PolicyVersion memory v = Policies.launch(address(rs), START, OPEN_ENDED);
        vm.startPrank(admin);
        vm.expectRevert(E.UnknownPolicyVersion.selector);
        engine.addPolicyVersion(sid, 1, v);
        engine.addPolicyVersion(sid, 0, v);
        vm.expectRevert(E.PolicyVersionImmutable.selector);
        engine.addPolicyVersion(sid, 0, v);
        for (uint8 i = 1; i < 8; ++i) engine.addPolicyVersion(sid, i, v);
        vm.expectRevert(E.UnknownPolicyVersion.selector);
        engine.addPolicyVersion(sid, 8, v);
        vm.expectRevert(E.UnknownSeries.selector);
        engine.addPolicyVersion(keccak256("nope"), 0, v);
        vm.stopPrank();
        vm.expectRevert(E.NotAdmin.selector);
        engine.addPolicyVersion(sid, 8, v);
    }
}
