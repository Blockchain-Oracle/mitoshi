// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IEngineLens, MarketRef} from "../engine/interfaces/IEngineLens.sol";
import {IPrintVerifier} from "../engine/interfaces/IPrintVerifier.sol";
import {ResolveLib} from "../engine/libs/ResolveLib.sol";
import {FairValue} from "./FairValue.sol";

/// @title The oracle fair-value bound the reserves check in the same call (A.5.4, PD-2(b), D-016).
/// @notice A reserve passes a signed "latest" spot (RedStone packages today; Data Streams where a ticker prints on it)
///         and gets back the model's P(Up) for a Window — `FairValue.probUpE6(spot, open print, σ, expiry − now)`.
///         Each caller applies its own house-conservative rule: Parlay a one-sided floor per leg, Range a two-sided
///         drift test with its own σ, Leverage a ceiling on the entry and a second knock-out test.
/// @dev Stateless per call except the owner's parameters: σ per Series (per √second × 1e8, calendar or session time as
///      the Series' clock runs), a spot source per ticker and the spot's maximum age. Previews stay `view` and take
///      the spot as a number instead of a proof.
contract FairValueGuard is Ownable2Step {
    struct SpotSource {
        IPrintVerifier verifier;
        bytes32 feedId;
    }

    IEngineLens public immutable lens;
    /// @notice The oldest spot a proof may carry (the verifier also refuses one more than 60 s ahead).
    uint32 public maxSpotAgeSec;
    mapping(bytes32 seriesId => uint64 sigmaE8) public sigmaE8OfSeries;
    mapping(uint16 ticker => SpotSource) public spotSourceOf;

    event SigmaSet(bytes32 indexed seriesId, uint64 sigmaE8);
    event SpotSourceSet(uint16 indexed ticker, address verifier, bytes32 feedId);
    event MaxSpotAgeSet(uint32 maxSpotAgeSec);

    error ZeroAddress();
    error BadSpotAge();
    error SigmaNotSet(bytes32 seriesId);
    error NoSpotSource(uint16 ticker);
    error OpenPrintMissing(bytes32 marketId);

    constructor(IEngineLens lens_, address owner_, uint32 maxSpotAgeSec_) Ownable(owner_) {
        if (address(lens_) == address(0)) revert ZeroAddress();
        lens = lens_;
        _setMaxSpotAge(maxSpotAgeSec_);
    }

    // ------------------------------------------------------------------ owner

    /// @notice σ per √second × 1e8 for every Window of `seriesId`; 0 unsets it (the Series then refuses).
    function setSigma(bytes32 seriesId, uint64 sigmaE8) external onlyOwner {
        sigmaE8OfSeries[seriesId] = sigmaE8;
        emit SigmaSet(seriesId, sigmaE8);
    }

    /// @notice The spot verifier and feed for `ticker`; a zero verifier unsets it.
    function setSpotSource(uint16 ticker, IPrintVerifier verifier, bytes32 feedId) external onlyOwner {
        spotSourceOf[ticker] = SpotSource(verifier, feedId);
        emit SpotSourceSet(ticker, address(verifier), feedId);
    }

    function setMaxSpotAge(uint32 sec) external onlyOwner {
        _setMaxSpotAge(sec);
    }

    // ------------------------------------------------------------------ reads

    /// @notice Verifies `proof` as `ticker`'s latest spot and returns it at expo −8 (the engine's normalisation).
    function spotOf(uint16 ticker, bytes calldata proof) public returns (int64 spotE8, uint40 observedAt) {
        SpotSource memory s = spotSourceOf[ticker];
        if (address(s.verifier) == address(0)) revert NoSpotSource(ticker);
        (int256 price, int8 expo, uint40 ts,) = s.verifier.verifySpot(proof, s.feedId, maxSpotAgeSec);
        return (ResolveLib.normalize(price, expo), ts);
    }

    /// @notice The fair P(Up) × 1e6 of Window `m` from a verified spot, and that spot.
    function fairUpE6(bytes32 m, bytes calldata proof) external returns (uint256 upE6, int64 spotE8) {
        MarketRef memory r = lens.marketRef(m);
        (spotE8,) = spotOf(r.ticker, proof);
        upE6 = _fair(m, r, spotE8);
    }

    /// @notice `fairUpE6` for a spot the caller supplies (previews; no proof, so never a bound).
    function previewFairUpE6(bytes32 m, int64 spotE8) external view returns (uint256) {
        return _fair(m, lens.marketRef(m), spotE8);
    }

    /// @notice σ for Window `m`'s Series (0 when unset).
    function sigmaOf(bytes32 m) external view returns (uint64) {
        return sigmaE8OfSeries[lens.marketRef(m).seriesId];
    }

    // ------------------------------------------------------------------ internals

    function _fair(bytes32 m, MarketRef memory r, int64 spotE8) internal view returns (uint256) {
        if (r.openE8 <= 0) revert OpenPrintMissing(m);
        uint64 sigma = sigmaE8OfSeries[r.seriesId];
        if (sigma == 0) revert SigmaNotSet(r.seriesId);
        uint256 tau = r.expiry > block.timestamp ? r.expiry - block.timestamp : 0;
        return FairValue.probUpE6(spotE8, r.openE8, sigma, tau);
    }

    function _setMaxSpotAge(uint32 sec) internal {
        if (sec == 0) revert BadSpotAge();
        maxSpotAgeSec = sec;
        emit MaxSpotAgeSet(sec);
    }
}
