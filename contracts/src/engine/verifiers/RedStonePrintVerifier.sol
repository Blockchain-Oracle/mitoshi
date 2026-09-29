// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IPrintVerifier, PrintQuery} from "../interfaces/IPrintVerifier.sol";
import {IEngineErrors as E} from "../EngineErrors.sol";
import {SOURCE_REDSTONE} from "../EngineTypes.sol";
import {RedStonePayload as P} from "./lib/RedStonePayload.sol";
import {Median} from "./lib/Median.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/crates/agari-common/src/print/redstone.rs — our own
// parser (the BUSL RedStone EVM connector is not used, D-016), with Agari's stricter rules kept.

/// @title RedStone signed-package prints (A.5.1, E-45). Stateless; the signer set and threshold are immutable (T06).
/// @notice Exact-T: every package timestamp must equal `T·1000` (replacing RedStone's ±3 min default). Anti-selection
///         (PD-1): inside `strictSec` of T a poster must present **every** configured signer; after it, `threshold`.
///         Every posted package must be a valid signature by a distinct configured signer: an unknown signer refuses
///         `UnknownRedStoneSigner`, a repeat `DuplicateRedStoneSigner` (T02). The print is the median (even count =
///         floored average) at expo −8.
contract RedStonePrintVerifier is IPrintVerifier {
    uint256 public constant MAX_SIGNERS = 5;
    /// A spot may be at most this far in the future (clock skew).
    uint256 public constant MAX_FUTURE_SEC = 60;

    address private immutable _s0;
    address private immutable _s1;
    address private immutable _s2;
    address private immutable _s3;
    address private immutable _s4;
    uint8 public immutable signerCount;
    uint8 public immutable threshold;

    /// @param signers_ 1..5 distinct non-zero EVM addresses (launch: `redstone-primary-prod`, = Agari's five).
    /// @param threshold_ `1 ≤ threshold ≤ signers_.length` (launch: 3).
    constructor(address[] memory signers_, uint8 threshold_) {
        uint256 n = signers_.length;
        if (n == 0 || n > MAX_SIGNERS || threshold_ == 0 || threshold_ > n) revert E.BadSignerSet();
        for (uint256 i; i < n; ++i) {
            if (signers_[i] == address(0)) revert E.BadSignerSet();
            for (uint256 j; j < i; ++j) if (signers_[j] == signers_[i]) revert E.BadSignerSet();
        }
        address[5] memory s;
        for (uint256 i; i < n; ++i) s[i] = signers_[i];
        (_s0, _s1, _s2, _s3, _s4) = (s[0], s[1], s[2], s[3], s[4]);
        // forge-lint: disable-next-line(unsafe-typecast)
        signerCount = uint8(n);
        threshold = threshold_;
    }

    function source() external pure returns (uint8) {
        return SOURCE_REDSTONE;
    }

    function signers() external view returns (address[] memory out) {
        out = new address[](signerCount);
        for (uint256 i; i < out.length; ++i) out[i] = _signer(i);
    }

    /// @notice prints.md §4.2 in order: preparse → feed pin → every timestamp `== T·1000` → required count → every
    ///         signature a distinct configured signer → value bounds → median.
    function verifyPrint(bytes calldata proof, PrintQuery calldata q)
        external
        view
        returns (int256 price, int8 expo, uint40 sourceTs, uint8 count)
    {
        uint256 n = P.preparse(proof, signerCount);
        _feeds(proof, n, q.feedId);
        uint256 tMs = uint256(q.t) * 1000;
        for (uint256 i; i < n; ++i) if (P.timestampMs(proof, i) != tMs) revert E.RedStoneTimestampMismatch();
        uint256 required = block.timestamp < uint256(q.t) + q.strictSec ? signerCount : threshold;
        if (n < required) revert E.InsufficientRedStoneSigners();
        price = int256(_medianOfSigned(proof, n));
        // forge-lint: disable-next-line(unsafe-typecast)
        return (price, -8, q.t, uint8(n));
    }

    /// @notice "Latest" mode for fair-value and reference checks (A.5.4, X12): one timestamp across packages, at most
    ///         `maxAgeSec` old and `MAX_FUTURE_SEC` ahead, at least `threshold` distinct configured signers.
    function verifySpot(bytes calldata proof, bytes32 feedId, uint32 maxAgeSec)
        external
        view
        returns (int256 price, int8 expo, uint40 sourceTs, uint8 count)
    {
        uint256 n = P.preparse(proof, signerCount);
        _feeds(proof, n, feedId);
        uint256 tsMs = P.timestampMs(proof, 0);
        for (uint256 i = 1; i < n; ++i) if (P.timestampMs(proof, i) != tsMs) revert E.RedStoneTimestampMismatch();
        uint256 ts = tsMs / 1000;
        if (ts > block.timestamp + MAX_FUTURE_SEC || (block.timestamp > ts && block.timestamp - ts > maxAgeSec)) {
            revert E.SpotTooOld();
        }
        if (n < threshold) revert E.InsufficientRedStoneSigners();
        price = int256(_medianOfSigned(proof, n));
        // forge-lint: disable-next-line(unsafe-typecast)
        return (price, -8, uint40(ts), uint8(n));
    }

    function _feeds(bytes calldata proof, uint256 n, bytes32 feedId) private pure {
        for (uint256 i; i < n; ++i) if (P.feedId(proof, i) != feedId) revert E.FeedIdMismatch();
    }

    /// Recovers every package's signer (OZ `tryRecover`: low-s only, no zero address), requires it configured and
    /// unseen, bounds each value to `1..int64.max` and returns the median.
    function _medianOfSigned(bytes calldata proof, uint256 n) private view returns (uint256) {
        uint256[] memory values = new uint256[](n);
        uint256 seen;
        for (uint256 i; i < n; ++i) {
            (bytes32 digest, uint8 v, bytes32 r, bytes32 s) = P.signature(proof, i);
            (address who, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, v, r, s);
            uint256 idx = err == ECDSA.RecoverError.NoError ? _indexOf(who) : MAX_SIGNERS;
            if (idx == MAX_SIGNERS) revert E.UnknownRedStoneSigner();
            if (seen & (1 << idx) != 0) revert E.DuplicateRedStoneSigner();
            seen |= 1 << idx;
            uint256 value = P.value(proof, i);
            if (value == 0 || value > uint256(uint64(type(int64).max))) revert E.InvalidPrintValue();
            values[i] = value;
        }
        return Median.median(values);
    }

    function _indexOf(address who) private view returns (uint256) {
        for (uint256 i; i < signerCount; ++i) if (_signer(i) == who) return i;
        return MAX_SIGNERS;
    }

    function _signer(uint256 i) private view returns (address) {
        if (i == 0) return _s0;
        if (i == 1) return _s1;
        if (i == 2) return _s2;
        if (i == 3) return _s3;
        return _s4;
    }
}
