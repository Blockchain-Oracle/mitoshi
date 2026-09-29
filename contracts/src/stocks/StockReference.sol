// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IPrintVerifier} from "../engine/interfaces/IPrintVerifier.sol";
import {IDataStreamsVerifierProxy} from "../engine/verifiers/DataStreamsPrintVerifier.sol";
import {IStockReference, Ref, RefSource, SessionState} from "./interfaces/IStockReference.sol";

/// @title StockReference — the underlying share price each mirror is guarded against (plan B.3.2, ST-11).
/// @notice One `Ref` per mirror: USD per share × 1e18 (the multiplier is applied by the guard, never here), with its
///         observation time and source. Writes:
///         - `pushRedStone` (permissionless): each payload goes through the S2 RedStone verifier's `verifySpot` (X12:
///           one timestamp, ≥ 3 of the 5 `redstone-primary-prod` signers, ≤ 60 s ahead); value e-8 → e18.
///         - `pushDataStreams` (permissionless): each v11 report is verified by the Chainlink VerifierProxy; the price is
///           the `mid`, `observedAt` = `observationsTimestamp`, and its `marketStatus` feeds `currentSession`.
///         - `pushKeeper` (KEEPER_ROLE): a labelled KEEPER price, refused by pools that `requireVerified`.
///         A write is accepted only if it is newer than the stored one (older or equal is ignored with an event, so
///         racing writers never revert each other), at most 60 s in the future, and non-zero.
///         `currentSession()`: the keeper's flag while it is valid, else the last Data Streams `marketStatus` if under
///         120 s old, else UNKNOWN (which the guard treats as closed).
contract StockReference is IStockReference, AccessControl {
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    uint256 public constant MAX_FUTURE_SEC = 60;
    uint256 public constant DS_STATUS_MAX_AGE = 120;
    /// The verifier-side age bound on a pushed spot; freshness per session is the guard's job (`maxAgeClosed` = 4 d).
    uint32 public constant MAX_SPOT_AGE = 345_600;
    uint256 public constant MAX_SESSION_TTL = 1 days;
    uint8 internal constant SOURCE_REDSTONE = 2;

    struct Feeds {
        bytes32 redstone;
        bytes32 dataStreams;
    }

    IPrintVerifier public immutable redstone;
    /// Zero where Data Streams has no credentials (Moderato, Q-011).
    IDataStreamsVerifierProxy public immutable dataStreams;

    mapping(address mirror => Ref) internal _refs;
    mapping(address mirror => Feeds) public feedsOf;
    mapping(bytes32 streamId => address mirror) public mirrorOfStream;

    SessionState public keeperSession;
    uint64 public keeperSessionUntil;
    uint8 public dsMarketStatus;
    uint64 public dsMarketStatusAt;

    event FeedsSet(address indexed mirror, bytes32 redstone, bytes32 dataStreams);
    event ReferenceWritten(address indexed mirror, uint256 priceE18, uint64 observedAt, RefSource source);
    event ReferenceIgnored(address indexed mirror, uint64 observedAt, uint64 storedObservedAt, RefSource source);
    event SessionSet(SessionState state, uint64 validUntil);
    event HaltedSet(address indexed mirror, bool halted);
    event MarketStatusSeen(uint8 status, uint64 observedAt);

    error NoFeed(address mirror);
    error UnknownStream(bytes32 streamId);
    error LengthMismatch();
    error BadPrice();
    error FromTheFuture(uint64 observedAt);
    error BadSessionTtl();
    error NotKeeperOrAdmin();
    error BadVerifier();
    error UnsupportedStream(bytes32 streamId);

    /// v11 report fields in order (DataStreamsPrintVerifier.V11; context/tempo/15 §1.2).
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

    constructor(address admin, IPrintVerifier redstone_, IDataStreamsVerifierProxy dataStreams_) {
        if (address(redstone_).code.length == 0 || redstone_.source() != SOURCE_REDSTONE) revert BadVerifier();
        if (address(dataStreams_) != address(0) && address(dataStreams_).code.length == 0) revert BadVerifier();
        redstone = redstone_;
        dataStreams = dataStreams_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ─── admin ───────────────────────────────────────────────────────────

    /// @notice Pins `mirror`'s RedStone feed id (e.g. bytes32("TSLA")) and Data Streams v11 stream id (0 = none).
    function setFeeds(address mirror, bytes32 redstoneFeed, bytes32 streamId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 old = feedsOf[mirror].dataStreams;
        if (old != bytes32(0)) delete mirrorOfStream[old];
        if (streamId != bytes32(0)) {
            if (uint16(bytes2(streamId)) != 11) revert UnsupportedStream(streamId);
            mirrorOfStream[streamId] = mirror;
        }
        feedsOf[mirror] = Feeds(redstoneFeed, streamId);
        emit FeedsSet(mirror, redstoneFeed, streamId);
    }

    // ─── writes ──────────────────────────────────────────────────────────

    /// @notice One RedStone "latest" payload per mirror (a payload carries a single feed), verified by `verifySpot`.
    function pushRedStone(address[] calldata mirrors, bytes[] calldata payloads) external {
        if (mirrors.length != payloads.length) revert LengthMismatch();
        for (uint256 i; i < mirrors.length; ++i) {
            bytes32 feed = feedsOf[mirrors[i]].redstone;
            if (feed == bytes32(0)) revert NoFeed(mirrors[i]);
            (int256 price, int8 expo, uint40 ts,) = redstone.verifySpot(payloads[i], feed, MAX_SPOT_AGE);
            if (price <= 0 || expo != -8) revert BadPrice();
            _write(mirrors[i], uint256(price) * 1e10, uint64(ts), RefSource.REDSTONE);
        }
    }

    /// @notice Chainlink Data Streams v11 full reports; each stream id must be pinned to a mirror by `setFeeds`.
    function pushDataStreams(bytes[] calldata reports) external {
        if (address(dataStreams) == address(0)) revert UnsupportedStream(bytes32(0));
        for (uint256 i; i < reports.length; ++i) {
            V11 memory r = abi.decode(dataStreams.verify(reports[i], abi.encode(address(0))), (V11));
            address mirror = mirrorOfStream[r.feedId];
            if (mirror == address(0)) revert UnknownStream(r.feedId);
            if (r.mid <= 0) revert BadPrice();
            uint64 obs = r.observationsTimestamp;
            if (obs > dsMarketStatusAt && obs <= block.timestamp + MAX_FUTURE_SEC) {
                // forge-lint: disable-next-line(unsafe-typecast)
                dsMarketStatus = uint8(r.marketStatus);
                dsMarketStatusAt = obs;
                emit MarketStatusSeen(uint8(r.marketStatus), obs);
            }
            // forge-lint: disable-next-line(unsafe-typecast)
            _write(mirror, uint256(int256(r.mid)), obs, RefSource.DATASTREAMS);
        }
    }

    /// @notice A keeper-attested price, labelled KEEPER (never counted as verified).
    function pushKeeper(address mirror, uint256 priceE18, uint64 observedAt) external onlyRole(KEEPER_ROLE) {
        _write(mirror, priceE18, observedAt, RefSource.KEEPER);
    }

    /// @notice The keeper's session flag, valid until `validUntil` (at most a day ahead).
    function setSession(SessionState state, uint64 validUntil) external onlyRole(KEEPER_ROLE) {
        if (validUntil <= block.timestamp || validUntil > block.timestamp + MAX_SESSION_TTL) revert BadSessionTtl();
        keeperSession = state;
        keeperSessionUntil = validUntil;
        emit SessionSet(state, validUntil);
    }

    /// @notice Halts (or resumes) trading against `mirror`'s reference. Keeper or admin.
    function setHalted(address mirror, bool halted) external {
        if (!hasRole(KEEPER_ROLE, msg.sender) && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert NotKeeperOrAdmin();
        _refs[mirror].halted = halted;
        emit HaltedSet(mirror, halted);
    }

    function _write(address mirror, uint256 priceE18, uint64 observedAt, RefSource source) internal {
        if (priceE18 == 0 || priceE18 > type(uint128).max) revert BadPrice();
        if (observedAt > block.timestamp + MAX_FUTURE_SEC) revert FromTheFuture(observedAt);
        Ref storage r = _refs[mirror];
        if (observedAt <= r.observedAt) {
            emit ReferenceIgnored(mirror, observedAt, r.observedAt, source);
            return;
        }
        // forge-lint: disable-next-line(unsafe-typecast)
        r.priceE18 = uint128(priceE18);
        r.observedAt = observedAt;
        r.writtenAt = uint64(block.timestamp);
        r.source = source;
        emit ReferenceWritten(mirror, priceE18, observedAt, source);
    }

    // ─── views ───────────────────────────────────────────────────────────

    function read(address mirror) external view returns (Ref memory) {
        return _refs[mirror];
    }

    function currentSession() public view returns (SessionState) {
        if (block.timestamp <= keeperSessionUntil) return keeperSession;
        if (dsMarketStatusAt != 0 && block.timestamp <= uint256(dsMarketStatusAt) + DS_STATUS_MAX_AGE) {
            return sessionOfMarketStatus(dsMarketStatus);
        }
        return SessionState.UNKNOWN;
    }

    /// @notice v11 `marketStatus`: 2 Regular; 1 Pre, 3 Post, 4 Overnight → EXTENDED; 5 Closed; 0 or other → UNKNOWN.
    function sessionOfMarketStatus(uint8 status) public pure returns (SessionState) {
        if (status == 2) return SessionState.REGULAR;
        if (status == 1 || status == 3 || status == 4) return SessionState.EXTENDED;
        if (status == 5) return SessionState.CLOSED;
        return SessionState.UNKNOWN;
    }
}
