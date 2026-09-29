// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {RedStonePrintVerifier} from "../../../src/engine/verifiers/RedStonePrintVerifier.sol";
import {PrintQuery} from "../../../src/engine/interfaces/IPrintVerifier.sol";
import {IEngineErrors as E} from "../../../src/engine/EngineErrors.sol";
import {PrintSigner as S} from "../harness/PrintSigner.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/crates/agari-common/src/print/redstone/tests.rs.
/// A.5.1: synthetic packages in the exact wire format signed by five test keys, and Agari's two real archived TSLA
/// payloads against the production signers. Deviations T02 (unknown/duplicate signers refuse by name) are asserted.
contract RedStoneVerifierTest is Test {
    uint40 internal constant T = 1_789_156_800;
    uint32 internal constant STRICT = 300;
    bytes32 internal constant TSLA = bytes32("TSLA");

    RedStonePrintVerifier internal v;

    function setUp() public {
        v = new RedStonePrintVerifier(S.signers(5), 3);
    }

    function q(uint40 t) internal pure returns (PrintQuery memory) {
        return PrintQuery(bytes32(0), 1, t, TSLA, STRICT, 0, 0, 0, 0, 0);
    }

    function values(uint256 a, uint256 b, uint256 c, uint256 d, uint256 e, uint256 n) internal pure returns (uint256[] memory out) {
        uint256[5] memory all = [a, b, c, d, e];
        out = new uint256[](n);
        for (uint256 i; i < n; ++i) out[i] = all[i];
    }

    function verify(bytes memory proof, uint256 nowTs) internal returns (int256 price, uint8 count) {
        vm.warp(nowTs);
        (price,,, count) = v.verifyPrint(proof, q(T));
    }

    function expectFail(bytes memory proof, uint256 nowTs, bytes4 err) internal {
        vm.warp(nowTs);
        vm.expectRevert(err);
        v.verifyPrint(proof, q(T));
    }

    function test_fiveSignersInsideStrictPrintTheMedian() public {
        bytes memory p = S.prices(TSLA, values(36_547_000_000, 36_548_000_000, 36_547_600_000, 36_549_000_000, 36_546_000_000, 5), T);
        assertEq(p.length, 5 * 142 + 14);
        vm.warp(T + 10);
        (int256 price, int8 expo, uint40 ts, uint8 count) = v.verifyPrint(p, q(T));
        assertEq(price, 36_547_600_000);
        assertEq(expo, -8);
        assertEq(ts, T);
        assertEq(count, 5);
    }

    function test_fourInsideStrictRefusedThreeAfterStrictPrints() public {
        expectFail(S.prices(TSLA, values(1, 2, 3, 4, 0, 4), T), T + STRICT - 1, E.InsufficientRedStoneSigners.selector);
        bytes memory three = S.prices(TSLA, values(36_547_000_000, 36_547_600_000, 36_548_000_000, 0, 0, 3), T);
        expectFail(three, T + STRICT - 1, E.InsufficientRedStoneSigners.selector);
        (int256 price, uint8 count) = verify(three, T + STRICT);
        assertEq(price, 36_547_600_000);
        assertEq(count, 3);
        expectFail(S.prices(TSLA, values(1, 2, 0, 0, 0, 2), T), T + 900, E.InsufficientRedStoneSigners.selector);
    }

    function test_evenCountTakesTheFloorAverage() public {
        (int256 price,) = verify(S.prices(TSLA, values(100_000_000, 200_000_000, 300_000_001, 400_000_000, 0, 4), T), T + STRICT);
        assertEq(price, 250_000_000);
    }

    /// T02: a repeated signer refuses the whole print by name (Agari: BadRedStonePackage).
    function test_aRepeatedSignerRefusesTheWholePrint() public {
        bytes[] memory ps = new bytes[](5);
        for (uint256 i; i < 4; ++i) ps[i] = S.package(S.key(i), TSLA, 10 + i, uint256(T) * 1000);
        ps[4] = S.package(S.key(0), TSLA, 14, uint256(T) * 1000);
        expectFail(S.payload(ps), T + 10, E.DuplicateRedStoneSigner.selector);
    }

    /// T02: an unknown or malleated signature refuses by name (Agari dropped it below N → InsufficientRedStoneSigners).
    function test_anUnknownOrMalleatedSignatureRefuses() public {
        bytes[] memory ps = new bytes[](5);
        for (uint256 i; i < 4; ++i) ps[i] = S.package(S.key(i), TSLA, 10 + i, uint256(T) * 1000);
        ps[4] = S.package(S.key(9), TSLA, 14, uint256(T) * 1000);
        expectFail(S.payload(ps), T + 10, E.UnknownRedStoneSigner.selector);
        // The high-s twin of a valid signature (v flipped) recovers the same key on bare ecrecover; OZ refuses it.
        ps[4] = S.package(S.key(4), TSLA, 14, uint256(T) * 1000);
        bytes memory good = ps[4];
        uint256 sAt = 77 + 32;
        uint256 s;
        assembly {
            s := mload(add(add(good, 32), sAt))
        }
        uint256 n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141;
        uint256 highS = n - s;
        assembly {
            mstore(add(add(good, 32), sAt), highS)
        }
        good[141] = bytes1(uint8(good[141]) == 27 ? 28 : 27);
        expectFail(S.payload(ps), T + STRICT, E.UnknownRedStoneSigner.selector);
    }

    function test_timestampsFeedsAndValuesAreExact() public {
        bytes[] memory ps = new bytes[](5);
        for (uint256 i; i < 4; ++i) ps[i] = S.package(S.key(i), TSLA, 10 + i, uint256(T) * 1000);
        ps[4] = S.package(S.key(4), TSLA, 14, (uint256(T) + 10) * 1000);
        expectFail(S.payload(ps), T + 10, E.RedStoneTimestampMismatch.selector);
        expectFail(S.five(bytes32("NVDA"), 10, T), T + 10, E.FeedIdMismatch.selector);
        uint256 big = uint256(uint64(type(uint64).max));
        expectFail(S.prices(TSLA, values(big, big, big, big, big, 5), T), T + 10, E.InvalidPrintValue.selector);
        // A zero value refuses the print (Agari's SDK dropped it below N → InsufficientRedStoneSigners).
        expectFail(S.prices(TSLA, values(0, 0, 0, 0, 0, 5), T), T + 10, E.InvalidPrintValue.selector);
    }

    function test_malformedPayloadsNeverReachCrypto() public {
        bytes memory good = S.prices(TSLA, values(10, 11, 12, 13, 14, 5), T);
        bytes memory badMarker = bytes.concat(good);
        badMarker[badMarker.length - 1] = 0x01;
        expectFail(badMarker, T + 10, E.BadRedStonePackage.selector);
        expectFail(_slice(good, 1, good.length), T + 10, E.BadRedStonePackage.selector);
        expectFail(_slice(good, 0, 10), T + 10, E.BadRedStonePackage.selector);
        bytes[] memory six = new bytes[](6);
        for (uint256 i; i < 5; ++i) six[i] = S.package(S.key(i), TSLA, 1 + i, uint256(T) * 1000);
        six[5] = S.package(S.key(0), TSLA, 6, uint256(T) * 1000);
        expectFail(S.payload(six), T + 10, E.BadRedStonePackage.selector);
        bytes memory twoPoints = bytes.concat(good);
        twoPoints[76] = 0x02; // data_point_count low byte of package 0
        expectFail(twoPoints, T + 10, E.BadRedStonePackage.selector);
        bytes memory metadata = bytes.concat(good);
        metadata[metadata.length - 10] = 0x01; // unsigned metadata size
        expectFail(metadata, T + 10, E.BadRedStonePackage.selector);
    }

    function test_constructorRefusesBadSignerSets() public {
        address[] memory none = new address[](0);
        vm.expectRevert(E.BadSignerSet.selector);
        new RedStonePrintVerifier(none, 1);
        vm.expectRevert(E.BadSignerSet.selector);
        new RedStonePrintVerifier(S.signers(6), 3);
        vm.expectRevert(E.BadSignerSet.selector);
        new RedStonePrintVerifier(S.signers(2), 3);
        vm.expectRevert(E.BadSignerSet.selector);
        new RedStonePrintVerifier(S.signers(2), 0);
        address[] memory dup = S.signers(3);
        dup[2] = dup[0];
        vm.expectRevert(E.BadSignerSet.selector);
        new RedStonePrintVerifier(dup, 2);
        dup[2] = address(0);
        vm.expectRevert(E.BadSignerSet.selector);
        new RedStonePrintVerifier(dup, 2);
        assertEq(v.signers().length, 5);
        assertEq(v.threshold(), 3);
        assertEq(v.source(), 2);
    }

    // ---- verifySpot ("latest", X12) ----

    function test_spotAcceptsAFreshConsistentPayload() public {
        vm.warp(T + 30);
        (int256 price, int8 expo, uint40 ts, uint8 count) = v.verifySpot(S.five(TSLA, 36_000_000_000, T), TSLA, 60);
        assertEq(price, 36_000_000_000);
        assertEq(expo, -8);
        assertEq(ts, T);
        assertEq(count, 5);
        (price,,, count) = v.verifySpot(S.prices(TSLA, values(1e9, 2e9, 3e9, 0, 0, 3), T), TSLA, 60);
        assertEq(count, 3, "threshold, not every signer");
    }

    function test_spotRefusesStaleFutureMixedAndThin() public {
        bytes memory p = S.five(TSLA, 36_000_000_000, T);
        vm.warp(T + 61);
        vm.expectRevert(E.SpotTooOld.selector);
        v.verifySpot(p, TSLA, 60);
        vm.warp(T - 61);
        vm.expectRevert(E.SpotTooOld.selector);
        v.verifySpot(p, TSLA, 60);
        vm.warp(T);
        bytes[] memory ps = new bytes[](3);
        for (uint256 i; i < 3; ++i) ps[i] = S.package(S.key(i), TSLA, 1e9, (uint256(T) + i) * 1000);
        vm.expectRevert(E.RedStoneTimestampMismatch.selector);
        v.verifySpot(S.payload(ps), TSLA, 60);
        vm.expectRevert(E.InsufficientRedStoneSigners.selector);
        v.verifySpot(S.prices(TSLA, values(1e9, 2e9, 0, 0, 0, 2), T), TSLA, 60);
    }

    // ---- Real archived packages (test/fixtures/prints/README.md) ----

    function _real(uint256 t) internal view returns (bytes memory) {
        string memory path = string.concat(vm.projectRoot(), "/test/fixtures/prints/redstone-tsla-", vm.toString(t), ".hex");
        return vm.parseBytes(string.concat("0x", vm.trim(vm.readFile(path))));
    }

    function _production() internal returns (RedStonePrintVerifier) {
        address[] memory prod = new address[](5);
        prod[0] = 0xdEB22f54738d54976C4c0fe5ce6d408E40d88499;
        prod[1] = 0xDD682daEC5A90dD295d14DA4b0bec9281017b5bE;
        prod[2] = 0x51Ce04Be4b3E32572C4Ec9135221d0691Ba7d202;
        prod[3] = 0x9c5AE89C4Af6aA32cE58588DBaF90d18a855B6de;
        prod[4] = 0x8BB8F32Df04c8b654987DAaeD53D6B6091e3B774;
        return new RedStonePrintVerifier(prod, 3);
    }

    function test_theRealArchivedTslaPackagesVerifyAgainstTheProductionSigners() public {
        RedStonePrintVerifier prod = _production();
        bytes memory payload = _real(1_789_396_800);
        assertEq(payload.length, 5 * 142 + 14);
        vm.warp(1_789_396_800 + 15);
        (int256 price, int8 expo, uint40 ts, uint8 count) = prod.verifyPrint(payload, q(1_789_396_800));
        assertEq(price, 35_818_500_933);
        assertEq(expo, -8);
        assertEq(ts, 1_789_396_800);
        assertEq(count, 5);
        // Same packages, wrong boundary: the timestamps are exact to the millisecond.
        vm.expectRevert(E.RedStoneTimestampMismatch.selector);
        prod.verifyPrint(payload, q(1_789_396_800 - 10));
        vm.expectRevert(E.RedStoneTimestampMismatch.selector);
        prod.verifyPrint(payload, q(1_789_396_800 + 10));
        // T02: one flipped value byte recovers a different key → UnknownRedStoneSigner (Agari: dropped below N).
        payload[63] = bytes1(uint8(payload[63]) ^ 1);
        vm.expectRevert(E.UnknownRedStoneSigner.selector);
        prod.verifyPrint(payload, q(1_789_396_800));
        // The Gap closing boundary archive verifies too.
        vm.warp(1_789_392_600 + 15);
        (price,,, count) = prod.verifyPrint(_real(1_789_392_600), q(1_789_392_600));
        assertEq(price, 35_962_395_785);
        assertEq(count, 5);
    }

    function _slice(bytes memory b, uint256 from, uint256 to) internal pure returns (bytes memory out) {
        out = new bytes(to - from);
        for (uint256 i; i < out.length; ++i) out[i] = b[from + i];
    }

    /// Spike X12: `verifySpot` ("latest" mode) proves real live gateway packages against the production signers — the
    /// path `StockReference` (S15b) reuses for TSLA---24_7 and friends.
    function test_X12_liveLatestPackagesVerifyAsSpots() public {
        RedStonePrintVerifier prod = _production();
        string[2] memory names = ["redstone-eth-latest-1790656520", "redstone-tsla-24_7-latest-1790656530"];
        bytes32[2] memory feeds = [bytes32("ETH"), bytes32("TSLA---24_7")];
        int256[2] memory medians = [int256(266_389_405_200), int256(35_683_185_257)];
        uint40[2] memory ts = [uint40(1_790_656_520), uint40(1_790_656_530)];
        for (uint256 i; i < 2; ++i) {
            string memory path = string.concat(vm.projectRoot(), "/test/fixtures/prints/", names[i], ".hex");
            bytes memory payload = vm.parseBytes(string.concat("0x", vm.trim(vm.readFile(path))));
            vm.warp(ts[i] + 5);
            (int256 price, int8 expo, uint40 at, uint8 count) = prod.verifySpot(payload, feeds[i], 60);
            assertEq(price, medians[i]);
            assertEq(expo, -8);
            assertEq(at, ts[i]);
            assertEq(count, 5);
            vm.warp(ts[i] + 61);
            vm.expectRevert(E.SpotTooOld.selector);
            prod.verifySpot(payload, feeds[i], 60);
        }
    }
}
