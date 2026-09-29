// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice What the engine asks a verifier to prove for one print slot (A.5). Admission (PD-6: slot, source, empty
///         slot, earliest, deadline) has already run in the engine; the verifier owns everything the proof itself must
///         satisfy. `t` is the boundary (the Window's `tradingStart` or `expiry`).
struct PrintQuery {
    bytes32 marketId;
    uint8 which;
    uint40 t;
    bytes32 feedId;
    uint32 strictSec;
    uint16 graceSec;
    uint16 minDelaySec;
    uint16 barLenSec;
    uint16 maxConfBps;
    uint8 statusMask;
}

/// @title A stateless print verifier with an immutable signer set (D-016). The engine normalizes the returned
///        `(price, expo)` to e-8 (exact for expo ≥ −8, floor finer).
interface IPrintVerifier {
    /// @return The source id this verifier proves (SOURCE_REDSTONE 2 / SOURCE_ATTESTED 4 / SOURCE_DATA_STREAMS 5).
    function source() external view returns (uint8);

    /// @notice Verifies an exact-T print. Non-view: the Data Streams proxy's `verify` is state-changing.
    function verifyPrint(bytes calldata proof, PrintQuery calldata q)
        external
        returns (int256 price, int8 expo, uint40 sourceTs, uint8 signers);

    /// @notice Verifies a "latest" spot for fair-value checks (A.5.4, X12): equal timestamps, age ≤ `maxAgeSec`,
    ///         at most 60 s in the future, at least the verifier's threshold of signers.
    function verifySpot(bytes calldata proof, bytes32 feedId, uint32 maxAgeSec)
        external
        returns (int256 price, int8 expo, uint40 sourceTs, uint8 signers);
}
