// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IPrintVerifier, PrintQuery} from "../interfaces/IPrintVerifier.sol";
import {IEngineErrors as E} from "../EngineErrors.sol";
import {SOURCE_ATTESTED} from "../EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/crates/agari-common/src/print/attested.rs — the
// ed25519-precompile message becomes an EIP-712 typed struct (E-46), which removes the offsets-attack class.

/// @title Attested ("demo data", opt-in) prints (A.5.3). Stateless; up to four immutable attestors (T06).
/// @notice Domain `{name "EventsEngine Print", version "1", chainId, verifyingContract = the calling engine}` and the
///         struct binds the market and slot, so a signature can never be replayed on another engine, chain, market or
///         slot. Rules in Agari's order: the bar ends at T (`barStart == T − barLen`), the fetch is after the correction
///         cutoff and not in the future (`T + minDelay ≤ fetchedAt ≤ now`), the signer is an attestor (low-s only),
///         then `price > 0` and `−18 ≤ expo ≤ 0`.
contract AttestedPrintVerifier is IPrintVerifier {
    bytes32 public constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant PRINT_TYPEHASH = keccak256(
        "Print(bytes32 marketId,uint8 which,uint40 t,int64 price,int8 expo,bytes32 feedId,uint40 barStart,uint32 barLen,uint40 fetchedAt)"
    );
    /// `verifySpot`'s struct (fair-value checks, A.5.4).
    bytes32 public constant SPOT_TYPEHASH = keccak256("Spot(bytes32 feedId,int64 price,int8 expo,uint40 observedAt)");
    bytes32 private constant NAME_HASH = keccak256("EventsEngine Print");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 public constant MAX_ATTESTORS = 4;
    uint256 public constant MAX_FUTURE_SEC = 60;

    address private immutable _a0;
    address private immutable _a1;
    address private immutable _a2;
    address private immutable _a3;

    struct Signed {
        int64 price;
        int8 expo;
        uint40 barStart;
        uint40 fetchedAt;
        bytes signature;
    }

    constructor(address[] memory attestors_) {
        uint256 n = attestors_.length;
        if (n == 0 || n > MAX_ATTESTORS) revert E.BadSignerSet();
        address[4] memory a;
        for (uint256 i; i < n; ++i) {
            if (attestors_[i] == address(0)) revert E.BadSignerSet();
            for (uint256 j; j < i; ++j) if (attestors_[j] == attestors_[i]) revert E.BadSignerSet();
            a[i] = attestors_[i];
        }
        (_a0, _a1, _a2, _a3) = (a[0], a[1], a[2], a[3]);
    }

    function source() external pure returns (uint8) {
        return SOURCE_ATTESTED;
    }

    /// @notice The EIP-712 domain separator as seen by `engine` (the verifying contract is the engine, not this verifier).
    function domainSeparator(address engine) public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, engine));
    }

    /// @notice The digest an attestor signs for a print slot, as the engine `engine` will check it.
    function printDigest(address engine, PrintQuery calldata q, int64 price, int8 expo, uint40 barStart, uint40 fetchedAt)
        external
        view
        returns (bytes32)
    {
        return _printDigest(engine, q, price, expo, barStart, fetchedAt);
    }

    /// @param proof `abi.encode(int64 price, int8 expo, uint40 barStart, uint40 fetchedAt, bytes signature)`.
    function verifyPrint(bytes calldata proof, PrintQuery calldata q)
        external
        view
        returns (int256 price, int8 expo, uint40 sourceTs, uint8 signers)
    {
        Signed memory s;
        (s.price, s.expo, s.barStart, s.fetchedAt, s.signature) = abi.decode(proof, (int64, int8, uint40, uint40, bytes));
        if (uint256(s.barStart) + q.barLenSec != q.t) revert E.BadAttestation();
        if (uint256(s.fetchedAt) < uint256(q.t) + q.minDelaySec || s.fetchedAt > block.timestamp) revert E.BadAttestation();
        _attestor(_printDigest(msg.sender, q, s.price, s.expo, s.barStart, s.fetchedAt), s.signature);
        if (s.price <= 0 || s.expo > 0 || s.expo < -18) revert E.InvalidPrintValue();
        return (s.price, s.expo, q.t, 1);
    }

    /// @param proof `abi.encode(int64 price, int8 expo, uint40 observedAt, bytes signature)` over `Spot`, domain bound
    ///        to the caller.
    function verifySpot(bytes calldata proof, bytes32 feedId, uint32 maxAgeSec)
        external
        view
        returns (int256 price, int8 expo, uint40 sourceTs, uint8 signers)
    {
        (int64 p, int8 e, uint40 observedAt, bytes memory sig) = abi.decode(proof, (int64, int8, uint40, bytes));
        if (observedAt > block.timestamp + MAX_FUTURE_SEC || (block.timestamp > observedAt && block.timestamp - observedAt > maxAgeSec)) {
            revert E.SpotTooOld();
        }
        bytes32 structHash = keccak256(abi.encode(SPOT_TYPEHASH, feedId, p, e, observedAt));
        _attestor(keccak256(abi.encodePacked("\x19\x01", domainSeparator(msg.sender), structHash)), sig);
        if (p <= 0 || e > 0 || e < -18) revert E.InvalidPrintValue();
        return (p, e, observedAt, 1);
    }

    function attestors() external view returns (address[] memory out) {
        uint256 n;
        address[4] memory a = [_a0, _a1, _a2, _a3];
        for (uint256 i; i < 4; ++i) if (a[i] != address(0)) ++n;
        out = new address[](n);
        for (uint256 i; i < n; ++i) out[i] = a[i];
    }

    function _printDigest(address engine, PrintQuery calldata q, int64 price, int8 expo, uint40 barStart, uint40 fetchedAt)
        private
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(
            abi.encode(PRINT_TYPEHASH, q.marketId, q.which, q.t, price, expo, q.feedId, barStart, uint32(q.barLenSec), fetchedAt)
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(engine), structHash));
    }

    /// OZ `tryRecover` refuses high-s and malformed signatures; the recovered key must be a configured attestor.
    function _attestor(bytes32 digest, bytes memory sig) private view {
        (address who, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, sig);
        if (err != ECDSA.RecoverError.NoError) revert E.BadAttestation();
        if (who != _a0 && who != _a1 && who != _a2 && who != _a3) revert E.UnknownAttestor();
    }
}
