// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IPrintVerifier, PrintQuery} from "../../../src/engine/interfaces/IPrintVerifier.sol";

/// Test-only stand-in for a print source until the real verifiers land in S2.7 (F-S2-10): it "proves" whatever
/// `(price, expo, signers)` the test encodes as the proof, at the boundary `t`. S2.7 retires it from every suite.
contract TestPrintVerifier is IPrintVerifier {
    uint8 public immutable source;

    constructor(uint8 source_) {
        source = source_;
    }

    function verifyPrint(bytes calldata proof, PrintQuery calldata q)
        external
        pure
        returns (int256 price, int8 expo, uint40 sourceTs, uint8 signers)
    {
        (price, expo, signers) = abi.decode(proof, (int256, int8, uint8));
        sourceTs = q.t;
    }

    function verifySpot(bytes calldata proof, bytes32, uint32)
        external
        view
        returns (int256 price, int8 expo, uint40 sourceTs, uint8 signers)
    {
        (price, expo, signers) = abi.decode(proof, (int256, int8, uint8));
        sourceTs = uint40(block.timestamp);
    }
}
