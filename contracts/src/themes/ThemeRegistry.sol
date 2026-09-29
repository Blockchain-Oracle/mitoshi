// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {Band, Theme, ThemeParams, ThemeConstants as C} from "./ThemeTypes.sol";
import {IThemePoolGuard} from "./interfaces/IThemePoolGuard.sol";

/// @title ThemeRegistry — published themes, their versions and target bands (plan B.4.1, TH-02, TH-08).
/// @notice A theme is data, never code: a creator publishes tokens, per-token bands and a cash band, a fee (≤ 50 bps,
///         Q-025) and rebalancing limits, plus the hash of the canonical spec. Every new version bumps `version`, and
///         ThemeRouter refuses followers whose consent names an older one (re-consent). Tokens are listed only with a
///         registered guarded `(pathUSD, token)` pool: the owner (Safe) records each mirror's `PoolKey` once the
///         StockGuardHook (S15b) has registered it, and publish re-checks the guard live. `delist` is visibility only.
contract ThemeRegistry is Ownable2Step {
    IThemePoolGuard public guard;
    uint64 public themeCount;

    mapping(uint64 themeId => Theme) internal _themes;
    mapping(uint64 themeId => mapping(uint32 version => address[])) internal _tokens;
    mapping(bytes32 bandKey => Band) internal _bands; // keccak(themeId, version, token); pathUSD = cash band
    mapping(address token => PoolKey) internal _pools;

    event GuardSet(address indexed guard);
    event TokenPoolSet(address indexed token, bytes32 indexed poolId, PoolKey key);
    event ThemePublished(uint64 indexed themeId, address indexed creator, uint32 version, bytes32 specHash, string specURI);
    event AgentSet(uint64 indexed themeId, uint256 erc8004AgentId);
    event Delisted(uint64 indexed themeId, bool delisted);

    error NoGuard();
    error BadPoolKey();
    error PoolNotGuarded(address token);
    error UnknownTheme(uint64 themeId);
    error NotCreator();
    error BadFee();
    error BadSlippage();
    error BadInterval();
    error BadRefAge();
    error BadSessions();
    error BadSpec();
    error BadTokenCount();
    error DuplicateToken(address token);
    error BadBand(address token);
    error WeightsNot100();

    constructor(address owner_) Ownable(owner_) {}

    // ─── owner (Safe) ───

    function setGuard(IThemePoolGuard guard_) external onlyOwner {
        guard = guard_;
        emit GuardSet(address(guard_));
    }

    /// @notice Records `token`'s guarded pool. Requires currency0 = pathUSD, currency1 = token, the configured guard as
    ///         the hook, and the guard's own registration.
    function setTokenPool(address token, PoolKey calldata key) external onlyOwner {
        if (address(guard) == address(0)) revert NoGuard();
        if (
            Currency.unwrap(key.currency0) != C.PATH_USD || Currency.unwrap(key.currency1) != token
                || address(key.hooks) != address(guard)
        ) revert BadPoolKey();
        if (!guard.isGuardedPool(key)) revert PoolNotGuarded(token);
        _pools[token] = key;
        emit TokenPoolSet(token, keccak256(abi.encode(key)), key);
    }

    function delist(uint64 themeId, bool delisted_) external onlyOwner {
        _theme(themeId).delisted = delisted_;
        emit Delisted(themeId, delisted_);
    }

    // ─── creators ───

    function publish(ThemeParams calldata p) external returns (uint64 themeId) {
        themeId = ++themeCount;
        Theme storage t = _themes[themeId];
        t.creator = msg.sender;
        t.createdAt = uint40(block.timestamp);
        _write(themeId, t, p);
    }

    /// @notice A new version (followers must re-consent: ThemeRouter checks the version they followed).
    function publishVersion(uint64 themeId, ThemeParams calldata p) external {
        Theme storage t = _theme(themeId);
        if (t.creator != msg.sender) revert NotCreator();
        _write(themeId, t, p);
    }

    function setAgent(uint64 themeId, uint256 erc8004AgentId) external {
        Theme storage t = _theme(themeId);
        if (t.creator != msg.sender) revert NotCreator();
        t.erc8004AgentId = erc8004AgentId;
        emit AgentSet(themeId, erc8004AgentId);
    }

    // ─── views ───

    function theme(uint64 themeId) external view returns (Theme memory) {
        return _themeView(themeId);
    }

    function tokensOf(uint64 themeId, uint32 version) external view returns (address[] memory) {
        return _tokens[themeId][version];
    }

    /// @return listed whether `token` is in that version; `band` its band (pathUSD → the cash band)
    function bandOf(uint64 themeId, uint32 version, address token) external view returns (bool listed, Band memory band) {
        band = _bands[_bandKey(themeId, version, token)];
        // Tokens always have maxBps > 0 (validated), so a zero band means "not listed"; the cash band may be all zero
        // (fully invested) and exists for every published version.
        listed = token == C.PATH_USD ? version != 0 && version <= _themes[themeId].version : band.maxBps != 0;
    }

    function poolKeyOf(address token) external view returns (PoolKey memory) {
        return _pools[token];
    }

    /// @notice Listable now: a recorded pool the guard still reports as registered.
    function isEligible(address token) public view returns (bool) {
        PoolKey memory key = _pools[token];
        return address(guard) != address(0) && address(key.hooks) == address(guard) && guard.isGuardedPool(key);
    }

    // ─── internals ───

    function _write(uint64 themeId, Theme storage t, ThemeParams calldata p) internal {
        _validate(p);
        uint32 version = ++t.version;
        t.creatorFeeBps = p.creatorFeeBps;
        t.maxSlippageBps = p.maxSlippageBps;
        t.minIntervalSec = p.minIntervalSec;
        t.maxRefAgeSec = p.maxRefAgeSec;
        t.tokenCount = uint8(p.tokens.length);
        t.sessionsMask = p.sessionsMask;
        t.specHash = p.specHash;
        t.specURI = p.specURI;
        address[] storage list = _tokens[themeId][version];
        for (uint256 i; i < p.tokens.length; ++i) {
            list.push(p.tokens[i]);
            _bands[_bandKey(themeId, version, p.tokens[i])] = p.bands[i];
        }
        _bands[_bandKey(themeId, version, C.PATH_USD)] = p.cashBand;
        emit ThemePublished(themeId, t.creator, version, p.specHash, p.specURI);
    }

    function _validate(ThemeParams calldata p) internal view {
        if (p.creatorFeeBps > C.MAX_CREATOR_FEE_BPS) revert BadFee();
        if (p.maxSlippageBps == 0 || p.maxSlippageBps > C.MAX_SLIPPAGE_BPS) revert BadSlippage();
        if (p.minIntervalSec < C.MIN_INTERVAL_SEC) revert BadInterval();
        if (p.maxRefAgeSec == 0 || p.maxRefAgeSec > C.MAX_REF_AGE_SEC) revert BadRefAge();
        if (p.sessionsMask == 0 || p.sessionsMask >> C.SESSION_BITS != 0) revert BadSessions();
        if (p.specHash == bytes32(0) || bytes(p.specURI).length == 0) revert BadSpec();
        uint256 n = p.tokens.length;
        if (n == 0 || n > C.MAX_TOKENS || p.bands.length != n) revert BadTokenCount();
        // min ≤ target ≤ max per band and Σ target = 100 % together imply Σ min ≤ 100 % ≤ Σ max (always feasible).
        uint256 sumTarget = _checkBand(C.PATH_USD, p.cashBand);
        for (uint256 i; i < n; ++i) {
            address token = p.tokens[i];
            if (token == C.PATH_USD) revert DuplicateToken(token);
            for (uint256 j; j < i; ++j) {
                if (p.tokens[j] == token) revert DuplicateToken(token);
            }
            if (!isEligible(token)) revert PoolNotGuarded(token);
            if (p.bands[i].maxBps == 0) revert BadBand(token);
            sumTarget += _checkBand(token, p.bands[i]);
        }
        if (sumTarget != C.BPS) revert WeightsNot100();
    }

    function _checkBand(address token, Band calldata b) internal pure returns (uint256) {
        if (b.minBps > b.targetBps || b.targetBps > b.maxBps || b.maxBps > C.BPS) revert BadBand(token);
        return b.targetBps;
    }

    function _bandKey(uint64 themeId, uint32 version, address token) internal pure returns (bytes32) {
        return keccak256(abi.encode(themeId, version, token));
    }

    function _theme(uint64 themeId) internal view returns (Theme storage t) {
        t = _themes[themeId];
        if (t.creator == address(0)) revert UnknownTheme(themeId);
    }

    function _themeView(uint64 themeId) internal view returns (Theme memory) {
        return _theme(themeId);
    }
}
