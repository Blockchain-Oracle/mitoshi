// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {StockSyncCodec as C} from "../../../src/common/StockSyncCodec.sol";

/// Exposes the calldata decoders.
contract CodecHarness {
    function header(bytes calldata m) external pure returns (C.Header memory) {
        return C.decodeHeader(m);
    }

    function validate(bytes calldata m) external pure returns (C.Header memory) {
        return C.validate(m);
    }

    function multiplierAt(bytes calldata m, uint256 o) external pure returns (uint8 t, uint256 next, C.Multiplier memory r) {
        (t, next) = C.recordAt(m, o);
        r = C.decodeMultiplier(m, o);
    }

    function statusAt(bytes calldata m, uint256 o) external pure returns (uint8 t, uint256 next, C.Status memory r) {
        (t, next) = C.recordAt(m, o);
        r = C.decodeStatus(m, o);
    }
}

contract StockSyncCodecTest is Test {
    CodecHarness h = new CodecHarness();

    function _msg(C.Header memory hd, C.Multiplier memory m, C.Status memory s) internal pure returns (bytes memory) {
        return bytes.concat(C.encodeHeader(hd), C.encodeMultiplier(m), C.encodeStatus(s));
    }

    function test_layoutSizes() public pure {
        assertEq(C.encodeHeader(C.Header(1, 2, 3, 4)).length, C.HEADER_LEN);
        assertEq(C.encodeMultiplier(C.Multiplier(address(1), 1, 2, 3)).length, C.MULTIPLIER_LEN);
        assertEq(C.encodeStatus(C.Status(address(1), 7)).length, C.STATUS_LEN);
    }

    /// Byte-exact vector (also the TS encoder's vector in 14w): CRWD 4e18 at effectiveAt 1782999000.
    function test_vectorBytes() public pure {
        bytes memory m = C.encodeMultiplier(
            C.Multiplier(0xea72Ecca2d0f6bFA1394DBBCff85b52CD4233931, 4e18, 4e18, 1782999000)
        );
        assertEq(
            m,
            hex"01ea72ecca2d0f6bfa1394dbbcff85b52cd423393100000000000000003782dace9d90000000000000000000003782dace9d900000000000006a4667d8"
        );
        assertEq(C.encodeHeader(C.Header(4663, 1782999000, 7, 2)), hex"0100001237000000006a4667d800000000000000070002");
    }

    function testFuzz_roundtrip(C.Header memory hd, C.Multiplier memory m, C.Status memory s) public view {
        hd.count = 2;
        bytes memory b = _msg(hd, m, s);
        C.Header memory got = h.validate(b);
        assertEq(got.srcChainId, hd.srcChainId);
        assertEq(got.srcTimestamp, hd.srcTimestamp);
        assertEq(got.seq, hd.seq);
        assertEq(got.count, 2);
        (uint8 t1, uint256 n1, C.Multiplier memory gm) = h.multiplierAt(b, C.HEADER_LEN);
        assertEq(t1, C.T_MULTIPLIER);
        assertEq(gm.rhToken, m.rhToken);
        assertEq(gm.current, m.current);
        assertEq(gm.pending, m.pending);
        assertEq(gm.effectiveAt, m.effectiveAt);
        (uint8 t2, uint256 n2, C.Status memory gs) = h.statusAt(b, n1);
        assertEq(t2, C.T_STATUS);
        assertEq(gs.rhToken, s.rhToken);
        assertEq(gs.flags, s.flags);
        assertEq(n2, b.length);
    }

    function testFuzz_truncatedAnywhereReverts(uint256 cut) public {
        bytes memory b = _msg(C.Header(46630, 100, 1, 2), C.Multiplier(address(7), 1e18, 2e18, 500), C.Status(address(7), 3));
        cut = bound(cut, 0, b.length - 1);
        bytes memory t = new bytes(cut);
        for (uint256 i; i < cut; i++) t[i] = b[i];
        vm.expectRevert();
        h.validate(t);
    }

    function test_unknownTypeReverts() public {
        bytes memory b = bytes.concat(C.encodeHeader(C.Header(1, 1, 1, 1)), hex"03", new bytes(21));
        vm.expectRevert(abi.encodeWithSelector(C.UnknownRecordType.selector, uint8(3), C.HEADER_LEN));
        h.validate(b);
    }

    function test_badVersionReverts() public {
        bytes memory b = C.encodeHeader(C.Header(1, 1, 1, 0));
        b[0] = 0x02;
        vm.expectRevert(abi.encodeWithSelector(C.BadVersion.selector, uint8(2)));
        h.validate(b);
    }

    function test_countMismatchReverts() public {
        bytes memory b = bytes.concat(C.encodeHeader(C.Header(1, 1, 1, 2)), C.encodeStatus(C.Status(address(1), 0)));
        vm.expectRevert(abi.encodeWithSelector(C.CountMismatch.selector, uint16(2), uint256(1)));
        h.validate(b);
    }

    function test_emptySnapshotIsValid() public view {
        assertEq(h.validate(C.encodeHeader(C.Header(1, 1, 1, 0))).count, 0);
    }

    /// Later timestamp always wins; within one timestamp the higher seq wins.
    function testFuzz_ordering(uint64 t1, uint64 s1, uint64 t2, uint64 s2) public pure {
        uint128 k1 = C.orderingKey(t1, s1);
        uint128 k2 = C.orderingKey(t2, s2);
        if (t1 != t2) assertEq(k1 < k2, t1 < t2);
        else assertEq(k1 < k2, s1 < s2);
    }
}
