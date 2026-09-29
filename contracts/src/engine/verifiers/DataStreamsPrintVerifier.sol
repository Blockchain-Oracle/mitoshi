// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IPrintVerifier, PrintQuery} from "../interfaces/IPrintVerifier.sol";
import {IEngineErrors as E} from "../EngineErrors.sol";
import {SOURCE_DATA_STREAMS} from "../EngineTypes.sol";

/// @notice The Chainlink Data Streams VerifierProxy (Tempo mainnet `0xcE73…36E7`, Moderato `0x7279…Db64`; "VerifierProxy
///         2.0.0", no fee manager, no access controller — context/tempo/15 §1.2). The proxy's `verify` is payable; it is
///         declared non-payable here because Tempo has no native value (the selector is the same, value is always 0).
interface IDataStreamsVerifierProxy {
    function verify(bytes calldata payload, bytes calldata parameterPayload) external returns (bytes memory);
}

/// @title Chainlink Data Streams prints (A.5.2, E-44/E-47 rules carried to Streams). Stateless; the proxy is immutable.
/// @notice The report is verified by the DON's signatures through the proxy, then pinned to the policy: feed id,
///         version from the feed id (v3 or v11), the exact-T window `validFrom ≤ T ≤ observations ≤ T + graceSec`,
///         v11's `marketStatus` against the policy's mask, and an optional spread bound (T07). Prices are expo −18.
contract DataStreamsPrintVerifier is IPrintVerifier {
    uint256 public constant MAX_FUTURE_SEC = 60;
    IDataStreamsVerifierProxy public immutable proxy;

    /// v11 field order, confirmed against the archived SPY RegularHours report (context/tempo/15 §1.2).
    struct V11 {
        bytes32 feedId;
        uint32 validFromTimestamp;
        uint32 observationsTimestamp;
        uint192 nativeFee;
        uint192 linkFee;
        uint32 expiresAt;
        int192 mid;
        uint64 lastSeenTimestampNs;
        int192 bid;
        int192 bidVolume;
        int192 ask;
        int192 askVolume;
        int192 lastTradedPrice;
        uint32 marketStatus;
    }

    struct V3 {
        bytes32 feedId;
        uint32 validFromTimestamp;
        uint32 observationsTimestamp;
        uint192 nativeFee;
        uint192 linkFee;
        uint32 expiresAt;
        int192 price;
        int192 bid;
        int192 ask;
    }

    /// The fields every check reads, from either version.
    struct Report {
        bytes32 feedId;
        uint32 validFrom;
        uint32 observations;
        int256 price;
        int256 bid;
        int256 ask;
        uint32 marketStatus;
        bool hasStatus;
    }

    constructor(address proxy_) {
        if (proxy_.code.length == 0) revert E.BadSignerSet();
        proxy = IDataStreamsVerifierProxy(proxy_);
    }

    function source() external pure returns (uint8) {
        return SOURCE_DATA_STREAMS;
    }

    function verifyPrint(bytes calldata proof, PrintQuery calldata q)
        external
        returns (int256 price, int8 expo, uint40 sourceTs, uint8 signers)
    {
        Report memory r = _verified(proof, q.feedId);
        uint256 t = q.t;
        if (!(r.validFrom <= t && t <= r.observations && r.observations <= t + q.graceSec)) revert E.DataStreamsWindowMismatch();
        if (r.hasStatus && (uint256(q.statusMask) >> r.marketStatus) & 1 == 0) revert E.InsufficientVerification();
        if (q.maxConfBps != 0 && (r.ask < r.bid || uint256(r.ask - r.bid) * 10_000 > uint256(q.maxConfBps) * uint256(r.price))) {
            revert E.ConfidenceTooWide();
        }
        return (r.price, -18, r.observations, 0);
    }

    function verifySpot(bytes calldata proof, bytes32 feedId, uint32 maxAgeSec)
        external
        returns (int256 price, int8 expo, uint40 sourceTs, uint8 signers)
    {
        Report memory r = _verified(proof, feedId);
        uint256 ts = r.observations;
        if (ts > block.timestamp + MAX_FUTURE_SEC || (block.timestamp > ts && block.timestamp - ts > maxAgeSec)) {
            revert E.SpotTooOld();
        }
        return (r.price, -18, r.observations, 0);
    }

    /// `verify(fullReport, abi.encode(address(0)))` — no fee token (the proxy has no fee manager) — then decode by the
    /// version in the feed id's first two bytes and pin the feed.
    function _verified(bytes calldata proof, bytes32 feedId) private returns (Report memory r) {
        uint16 version = uint16(bytes2(feedId));
        if (version != 3 && version != 11) revert E.UnsupportedReportVersion();
        bytes memory report = proxy.verify(proof, abi.encode(address(0)));
        if (version == 11) {
            V11 memory v = abi.decode(report, (V11));
            r = Report(v.feedId, v.validFromTimestamp, v.observationsTimestamp, v.mid, v.bid, v.ask, v.marketStatus, true);
        } else {
            V3 memory v = abi.decode(report, (V3));
            r = Report(v.feedId, v.validFromTimestamp, v.observationsTimestamp, v.price, v.bid, v.ask, 0, false);
        }
        if (r.feedId != feedId) revert E.FeedIdMismatch();
        if (r.price <= 0) revert E.InvalidPrintValue();
    }
}
