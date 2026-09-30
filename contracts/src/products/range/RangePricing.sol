// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/range/RangePricing.sol
// Seam edits (docs/specs/engine.md A.4.7): `WindowQuestion`, `IOracleHub`, `hub` and `venueId` are deleted — the
// Window's opening print is the engine's recorded open (`openE8 / 1e6` → cents; RangeMath and its vectors unchanged),
// the asset is proven by the admin's `setAssetTicker(asset, ticker)` against the Window's own Series ticker, and the
// DreamDEX module/pool reads become the lens by market id (status, `lockAt` for the entry cut-off, `expiry` for τ, T08).
// `_center` is the book-mid over rested levels (max(Series, params) `minRestSec`, D-109) with the probability scale
// derived from the grid — a whole contract is `PAIR_TICKS × tickBase` (Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:
// anchor/programs/agari-range/src/basis.rs `TICK_TO_E6`, the "mark factor" that was once restated wrong). PD-2/D-119:
// `_checkDrift` refuses `StaleBasis` when `|probitE4(centerQE6) − zSpotE4| > maxDriftE4`, the spot a same-call signed
// price verified through the FairValueGuard and z taken with the reserve's own σ over the seconds left.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IEventsEngine} from "../../engine/interfaces/IEventsEngine.sol";
import {IEngineLens, MarketRef, LevelRaw} from "../../engine/interfaces/IEngineLens.sol";
import {STATUS_TRADING, PAIR_TICKS} from "../../engine/EngineTypes.sol";
import {FairValueGuard} from "../../fair/FairValueGuard.sol";
import {ParlayMath} from "../parlay/ParlayMath.sol";
import {IRangeReserve} from "./IRangeReserve.sol";
import {RangeMath} from "./RangeMath.sol";

/// @title The reserve's seam to the engine, and its tunables.
/// @notice A band is priced from three things the chain holds: the Window's opening print (the engine's recorded
///         open), where the market sits now (P(close ≥ open) off the Window's rested book), and the house's
///         volatility for the asset over the seconds left. A same-call signed spot bounds the centre: a book that
///         has gone quiet while the price ran is refused rather than priced (D-119).
/// @dev Nothing here stores an engine address (AD-10): every reference is resolved from the lens by market id.
abstract contract RangePricing is IRangeReserve {
    uint64 internal constant PRICE_LEVELS = 32;
    uint256 internal constant MAX_NODES = 256;
    /// @dev Engine prints are × 1e8; the reserve's prints are cents.
    int256 internal constant E8_PER_CENT = 1e6;

    IERC20 public immutable collateral;
    IEventsEngine public immutable engine;
    IEngineLens public immutable lens;
    FairValueGuard public immutable guard;
    /// @dev One whole unit of collateral (10^decimals): the scale of every stake and probability at the seam.
    uint256 public immutable one;

    address public admin;
    bool public paused;
    Params public params;
    /// @dev Per-√second volatility × 1e8, keyed by `keccak256(asset)`; zero refuses the asset.
    mapping(bytes32 assetKey => uint64 sigmaE8) public volatilityOf;
    /// @dev The engine ticker an asset name stands for; zero refuses the asset.
    mapping(bytes32 assetKey => uint16 ticker) public tickerOf;

    /// @dev Everything `openRange` decides before it moves money.
    struct Priced {
        uint256 stake;
        uint256 probRaw;
        int256 openingPrint;
        uint64 expiry;
        MarketRef ref;
        Basis basis;
    }

    constructor(IERC20 collateral_, IEventsEngine engine_, IEngineLens lens_, FairValueGuard guard_, Params memory params_) {
        address coll = engine_.collateral();
        if (coll != address(collateral_)) revert WrongCollateral(coll);
        if (lens_.engine() != address(engine_)) revert WrongLens(address(lens_));
        if (address(guard_.lens()) != address(lens_)) revert WrongGuard(address(guard_));
        collateral = collateral_;
        engine = engine_;
        lens = lens_;
        guard = guard_;
        one = 10 ** IERC20Metadata(address(collateral_)).decimals();
        admin = msg.sender;
        _setParams(params_);
        // D-015: the reserve never holds engine positions, but no third party may ever redeem into it unattributed.
        engine_.setCrankOptOut(true);
    }

    // ------------------------------------------------------------------ admin

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin(msg.sender);
        _;
    }

    /// @notice Tunables only. Open rounds keep the terms they were opened on.
    function setParams(Params calldata next) external onlyAdmin {
        _setParams(next);
    }

    /// @notice The house's per-√second volatility for an asset, × 1e8.
    function setVolatility(string calldata asset, uint64 sigmaE8) external onlyAdmin {
        volatilityOf[keccak256(bytes(asset))] = sigmaE8;
        emit VolatilitySet(asset, sigmaE8);
    }

    /// @notice The engine ticker `asset` names (its Windows are the only ones the asset may be priced on); 0 unsets it.
    function setAssetTicker(string calldata asset, uint16 ticker) external onlyAdmin {
        tickerOf[keccak256(bytes(asset))] = ticker;
        emit AssetTickerSet(asset, ticker);
    }

    /// @notice Pauses new rounds and new supply. Settlement, claims, refunds and withdrawals never pause.
    function setPaused(bool next) external onlyAdmin {
        paused = next;
        emit PausedSet(next);
    }

    function setAdmin(address next) external onlyAdmin {
        if (next == address(0)) revert ZeroAddress();
        admin = next;
        emit AdminChanged(next);
    }

    function _setParams(Params memory p) internal {
        if (p.maxExposureBps > RangeMath.BPS || p.maxSpreadRaw == 0 || p.centerDepthRaw == 0) revert BadParams();
        if (p.minCenterQE6 >= p.maxCenterQE6 || p.maxCenterQE6 > RangeMath.P_ONE) revert BadParams();
        if (p.minProbRaw >= p.maxProbRaw || p.maxProbRaw > one) revert BadParams();
        if (p.minTimeLeftSec == 0 || p.maxHorizonSec <= p.minTimeLeftSec || p.staleAfterSec == 0) revert BadParams();
        if (p.maxPayoutCap == 0 || p.maxExpiryLocked == 0 || p.maxDriftE4 == 0) revert BadParams();
        params = p;
        emit ParamsUpdated(p);
    }

    // ------------------------------------------------------------------ pricing

    /// @notice What a round would cost right now, with every refusal the open would raise except the opener's own
    ///         `maxStake` guard, the reserve's caps and the drift bound (it needs a signed spot; see `previewDriftE4`).
    function previewOpen(bytes32 marketId, string calldata asset, Side side, int256 lowPrint, int256 highPrint, uint256 maxPayout)
        external
        view
        returns (uint256 stake, uint256 probRaw, int256 openingPrint, Basis memory basis)
    {
        Priced memory q = _price(marketId, asset, side, lowPrint, highPrint, maxPayout);
        return (q.stake, q.probRaw, q.openingPrint, q.basis);
    }

    /// @notice The Window's opening print and where its book puts the market now, as the pricing reads them.
    function previewBasis(bytes32 marketId, string calldata asset) external view returns (int256 openingPrint, uint256 centerQE6, uint64 sigmaE8) {
        MarketRef memory r = _resolve(marketId);
        sigmaE8 = volatilityOf[_requireAsset(marketId, asset, r)];
        openingPrint = _openingPrint(marketId, r);
        centerQE6 = _center(marketId, r);
    }

    /// @notice The drift the open would test for a spot the caller supplies (previews; no proof, so never the bound).
    function previewDriftE4(bytes32 marketId, string calldata asset, int64 spotE8) external view returns (int256 driftE4) {
        MarketRef memory r = _resolve(marketId);
        uint64 sigma = volatilityOf[_requireAsset(marketId, asset, r)];
        if (sigma == 0) revert NoVolatility(asset);
        uint256 tau = r.expiry > block.timestamp ? r.expiry - block.timestamp : 0;
        return _drift(_center(marketId, r), spotE8, r.openE8, sigma, tau);
    }

    function _price(bytes32 marketId, string calldata asset, Side side, int256 lowPrint, int256 highPrint, uint256 maxPayout)
        internal
        view
        returns (Priced memory q)
    {
        if (lowPrint <= 0 || highPrint <= lowPrint) revert BadBand(lowPrint, highPrint);
        if (maxPayout == 0 || maxPayout > params.maxPayoutCap) revert OverPayoutCap(maxPayout, params.maxPayoutCap);
        MarketRef memory r = _resolve(marketId);
        if (r.status != STATUS_TRADING) revert MarketNotTrading(marketId, r.status);
        // No entries in the Window's last seconds of trading (T08: `lockAt` bounds trading; τ runs to `expiry`).
        if (r.lockAt < block.timestamp + params.minTimeLeftSec) revert TooLate(marketId, r.lockAt);
        if (r.expiry > block.timestamp + params.maxHorizonSec) revert TooFar(marketId, r.expiry);
        uint256 tau = r.expiry - block.timestamp;

        uint64 sigma = volatilityOf[_requireAsset(marketId, asset, r)];
        if (sigma == 0) revert NoVolatility(asset);
        q.openingPrint = _openingPrint(marketId, r);
        uint256 centerQE6 = _center(marketId, r);

        uint256 pInsideE6 = RangeMath.bandProbE6(q.openingPrint, lowPrint, highPrint, centerQE6, sigma, tau);
        uint256 pE6 = side == Side.INSIDE ? pInsideE6 : RangeMath.P_ONE - pInsideE6;
        q.probRaw = pE6 * one / RangeMath.P_ONE;
        if (q.probRaw < params.minProbRaw) revert LongShot(q.probRaw, params.minProbRaw);
        if (q.probRaw > params.maxProbRaw) revert NearCertain(q.probRaw, params.maxProbRaw);
        q.stake = RangeMath.floorStake(maxPayout, q.probRaw, one, params.marginBps);
        // The house must front something, or the round is not a bet against it.
        if (q.stake >= maxPayout) revert Underpriced(q.stake, maxPayout);
        q.expiry = r.expiry;
        q.ref = r;
        q.basis = Basis({centerQE6: centerQE6, sigmaE8: sigma, tauSec: uint32(tau), spotE8: 0, driftE4: 0});
    }

    /// @dev PD-2/D-119 (two-sided): the centre the book implies must sit within `maxDriftE4` of the verified spot.
    function _checkDrift(bytes32 marketId, Priced memory q, bytes calldata spotProof) internal {
        (int64 spotE8,) = guard.spotOf(q.ref.ticker, spotProof);
        int256 d = _drift(q.basis.centerQE6, spotE8, q.ref.openE8, q.basis.sigmaE8, q.basis.tauSec);
        if (d > int256(uint256(params.maxDriftE4)) || -d > int256(uint256(params.maxDriftE4))) revert StaleBasis(marketId, d, params.maxDriftE4);
        q.basis.spotE8 = spotE8;
        // forge-lint: disable-next-line(unsafe-typecast)
        q.basis.driftE4 = int32(d);
    }

    /// @dev `probitE4(centre) − z(spot)`, both in σ over τ with the reserve's σ (RangeMath's linear z, as the band maths).
    function _drift(uint256 centerQE6, int256 spotE8, int256 openE8, uint64 sigmaE8, uint256 tau) internal pure returns (int256) {
        uint256 std = RangeMath.stdE8(sigmaE8, tau);
        int256 zSpot = std == 0 ? (spotE8 >= openE8 ? RangeMath.Z_MAX_E4 : -RangeMath.Z_MAX_E4) : RangeMath.zOf(spotE8, openE8, std);
        return RangeMath.probitE4(centerQE6) - zSpot;
    }

    /// @dev The asset must name this Window's own ticker.
    function _requireAsset(bytes32 marketId, string calldata asset, MarketRef memory r) internal view returns (bytes32 assetKey) {
        assetKey = keccak256(bytes(asset));
        uint16 ticker = tickerOf[assetKey];
        if (ticker == 0) revert NoTicker(asset);
        if (ticker != r.ticker) revert WrongAsset(marketId, asset);
    }

    /// @dev The engine's recorded opening print, in cents. A Window without one is refused, never guessed.
    function _openingPrint(bytes32 marketId, MarketRef memory r) internal pure returns (int256 print) {
        print = int256(r.openE8) / E8_PER_CENT;
        if (print <= 0) revert NoOpeningPrint(marketId);
    }

    /// @dev P(close ≥ open) as the book prices it: the YES mid over `centerDepthRaw` a side of rested orders, refused
    ///      thin, wide or decided. A whole contract is `PAIR_TICKS × tickBase` raw, so a 0.65 YES mid reads 650,000.
    function _center(bytes32 marketId, MarketRef memory r) internal view returns (uint256 centerQE6) {
        uint256 depth = params.centerDepthRaw;
        uint256 pair = uint256(PAIR_TICKS) * r.tickBase;
        uint32 rest = r.minRestSec > params.minRestSec ? r.minRestSec : params.minRestSec;
        (uint256 askYes, uint256 askFilled) = ParlayMath.vwap(lens.levelsRaw(marketId, false, PRICE_LEVELS, rest, MAX_NODES), false, pair, depth);
        (uint256 noPrice, uint256 bidFilled) = ParlayMath.vwap(lens.levelsRaw(marketId, true, PRICE_LEVELS, rest, MAX_NODES), true, pair, depth);
        if (askFilled < depth || bidFilled < depth) revert ThinBook(marketId, askFilled < bidFilled ? askFilled : bidFilled, depth);
        uint256 bidYes = pair - noPrice;
        uint256 spread = askYes > bidYes ? (askYes - bidYes) * one / pair : 0;
        if (spread > params.maxSpreadRaw) revert WideBook(marketId, spread, params.maxSpreadRaw);
        centerQE6 = (askYes + bidYes) * RangeMath.P_ONE / (2 * pair);
        if (centerQE6 < params.minCenterQE6 || centerQE6 > params.maxCenterQE6) revert WindowDecided(marketId, centerQE6);
    }

    /// @dev Everything about a Window comes off the lens by market id, in-transaction.
    function _resolve(bytes32 marketId) internal view returns (MarketRef memory r) {
        try lens.marketRef(marketId) returns (MarketRef memory got) {
            r = got;
        } catch {
            revert UnknownMarket(marketId);
        }
        if (r.lotBase == 0) revert UnknownMarket(marketId);
    }
}
