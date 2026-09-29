// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm} from "forge-std/Vm.sol";
import {PrintQuery} from "../../../src/engine/interfaces/IPrintVerifier.sol";
import {AttestedPrintVerifier} from "../../../src/engine/verifiers/AttestedPrintVerifier.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/crates/agari-common/src/print/redstone/tests.rs
// (`package`, `payload`) and packages/markets/src/prices/redstone.ts (`redstonePayload`).
/// Builds real signed proofs with test keys: RedStone wire payloads (5 secp256k1 keys, exactly the production layout)
/// and EIP-712 attested prints.
library PrintSigner {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes9 internal constant MARKER = 0x000002ed57011e0000;

    function key(uint256 i) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode("redstone-test-signer", i))) % 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140 + 1;
    }

    function signers(uint256 n) internal pure returns (address[] memory out) {
        out = new address[](n);
        for (uint256 i; i < n; ++i) out[i] = vm.addr(key(i));
    }

    /// One 142 B package signed by `pk`: `feed ‖ value ‖ ts_ms[6] ‖ 32[4] ‖ 1[3] ‖ r ‖ s ‖ v`.
    function package(uint256 pk, bytes32 feed, uint256 value, uint256 tsMs) internal pure returns (bytes memory p) {
        bytes memory signed = abi.encodePacked(feed, bytes32(value), bytes6(uint48(tsMs)), bytes4(uint32(32)), bytes3(uint24(1)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, keccak256(signed));
        p = abi.encodePacked(signed, r, s, v);
    }

    function payload(bytes[] memory packages) internal pure returns (bytes memory out) {
        for (uint256 i; i < packages.length; ++i) out = abi.encodePacked(out, packages[i]);
        out = abi.encodePacked(out, bytes2(uint16(packages.length)), bytes3(0), MARKER);
    }

    /// `values.length` packages at `tSec`, signed by test keys 0.. in order.
    function prices(bytes32 feed, uint256[] memory values, uint256 tSec) internal pure returns (bytes memory) {
        bytes[] memory ps = new bytes[](values.length);
        for (uint256 i; i < values.length; ++i) ps[i] = package(key(i), feed, values[i], tSec * 1000);
        return payload(ps);
    }

    /// Five packages at `tSec` whose median is `e8` (values e8−2 … e8+2).
    function five(bytes32 feed, uint256 e8, uint256 tSec) internal pure returns (bytes memory) {
        uint256[] memory v = new uint256[](5);
        (v[0], v[1], v[2], v[3], v[4]) = (e8 - 1, e8 + 2, e8, e8 + 1, e8 - 2);
        return prices(feed, v, tSec);
    }

    /// An EIP-712 attested print proof for `engine`.
    function attested(
        AttestedPrintVerifier verifier,
        uint256 pk,
        address engine,
        PrintQuery memory q,
        int64 price,
        int8 expo,
        uint40 fetchedAt
    ) internal view returns (bytes memory) {
        uint40 barStart = q.t - uint40(q.barLenSec);
        bytes32 digest = verifier.printDigest(engine, q, price, expo, barStart, fetchedAt);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encode(price, expo, barStart, fetchedAt, abi.encodePacked(r, s, v));
    }
}
