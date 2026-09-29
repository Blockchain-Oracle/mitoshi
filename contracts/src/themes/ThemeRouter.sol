// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {IAccountKeychain} from "tempo-std/interfaces/IAccountKeychain.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {Band, FollowCaps, Theme, Trade, ThemeConstants as C} from "./ThemeTypes.sol";
import {ThemeRegistry} from "./ThemeRegistry.sol";
import {IThemeOracle} from "./interfaces/IThemeOracle.sol";

/// @title ThemeRouter — a theme agent trades inside the follower's own account, never custodying (plan B.4.2, D-002,
///        D-023, D-100–D-102, TH-03/04/12, N-03/N-04).
/// @notice The follower (root key) consents once with caps and names the agent's access key; the key may then only
///         call `rebalance` and `approve` this router (checked at `follow` against `getAllowedCalls`). A rebalance
///         swaps through the guarded v4 pools inside `unlock`, sends every output to `msg.sender` (the follower —
///         structurally, there is no recipient argument), pulls inputs with the exact approvals the key raised
///         (TIP-1011 limits count those approvals), and settles each currency `sync → transferFrom → settle`. The only
///         tokens it ever holds are creator fees owed. Root-signed rebalances skip the follower's own caps, never the
///         theme's rules.
contract ThemeRouter is IUnlockCallback, Ownable2Step {
    IAccountKeychain internal constant KEYCHAIN = StdPrecompiles.ACCOUNT_KEYCHAIN;
    bytes4 internal constant APPROVE = ITIP20.approve.selector;
    uint256 internal constant ENVELOPE_SLACK_PCT = 102; // bought weight ≤ max × allocation × 1.02 (B.4.2)
    uint256 internal constant DAY = 1 days;
    uint256 internal constant MAX_LEGS = 2 * C.MAX_TOKENS;

    /// @dev Four slots, never zeroed (re-follow rewrites at the update price).
    struct Follow {
        address keyId;
        uint32 version;
        bool active;
        uint48 lastRebalanceAt;
        FollowCaps caps;
        uint48 dayStart;
        uint64 daySpentUsd;
    }

    IPoolManager public immutable poolManager;
    ThemeRegistry public immutable registry;
    IThemeOracle public oracle;
    address public proofTarget;
    mapping(bytes4 selector => bool) public proofSelectors;

    mapping(address follower => mapping(uint64 themeId => Follow)) internal _follows;
    mapping(address creator => uint256) public feesOwed;
    uint256 public totalFeesOwed;
    /// @dev The follower of the rebalance in flight: `unlockCallback` only settles for this account (defence in depth —
    ///      PoolManager only ever calls back the contract that called `unlock`).
    address transient _inFlight;

    event OracleSet(address indexed oracle);
    event ProofTargetSet(address indexed target);
    event ProofSelectorSet(bytes4 indexed selector, bool allowed);
    event Followed(address indexed follower, uint64 indexed themeId, uint32 version, address keyId, FollowCaps caps);
    event CapsUpdated(address indexed follower, uint64 indexed themeId, FollowCaps caps);
    event Unfollowed(address indexed follower, uint64 indexed themeId);
    event Rebalanced(
        address indexed follower,
        uint64 indexed themeId,
        bytes32 indexed decisionId,
        uint32 version,
        address txKey,
        uint256 notionalUsd,
        uint256 fee
    );
    event FeesClaimed(address indexed creator, uint256 amount);

    error RootOnly();
    error OnlyPoolManager();
    error VersionMismatch();
    error BadCaps();
    error FeeNotAccepted();
    error KeyInvalid();
    error KeyUnscoped();
    error ScopeNotAllowed(address target);
    error NotFollowing();
    error WrongKey();
    error FollowExpired();
    error TooSoon();
    error BadTrades();
    error TokenNotInTheme(address token);
    error BuyNotAllowed(address token);
    error ProofRefused();
    error SessionNotAllowed(uint8 session);
    error ReferenceUnusable(address token);
    error PartialFill(uint256 leg);
    error BelowMinOut(uint256 leg);
    error SlippageExceeded(uint256 leg);
    error TradeCap(uint256 leg);
    error DailyCap();
    error Envelope(address token);
    error ReceiveBlocked(address token);
    error AllowanceLeft(address token);
    error TransferFailed();
    error NothingOwed();

    constructor(IPoolManager poolManager_, ThemeRegistry registry_, IThemeOracle oracle_, address owner_) Ownable(owner_) {
        poolManager = poolManager_;
        registry = registry_;
        oracle = oracle_;
        emit OracleSet(address(oracle_));
    }

    // ─── owner (Safe) ───

    function setOracle(IThemeOracle oracle_) external onlyOwner {
        oracle = oracle_;
        emit OracleSet(address(oracle_));
    }

    /// @notice Where `rebalance` forwards a price proof (StockReference) and which of its push selectors it may call.
    function setProofTarget(address target) external onlyOwner {
        proofTarget = target;
        emit ProofTargetSet(target);
    }

    function setProofSelector(bytes4 selector, bool allowed) external onlyOwner {
        proofSelectors[selector] = allowed;
        emit ProofSelectorSet(selector, allowed);
    }

    // ─── follower (root key only) ───

    function follow(uint64 themeId, uint32 version, FollowCaps calldata caps, address keyId) external {
        _rootOnly();
        Theme memory t = registry.theme(themeId);
        if (version != t.version) revert VersionMismatch();
        _checkCaps(t, caps, keyId);
        _checkScopes(themeId, version, keyId);
        Follow storage f = _follows[msg.sender][themeId];
        f.keyId = keyId;
        f.version = version;
        f.active = true;
        f.caps = caps;
        emit Followed(msg.sender, themeId, version, keyId, caps);
    }

    function updateCaps(uint64 themeId, FollowCaps calldata caps) external {
        _rootOnly();
        Follow storage f = _follows[msg.sender][themeId];
        if (!f.active) revert NotFollowing();
        Theme memory t = registry.theme(themeId);
        if (f.version != t.version) revert VersionMismatch();
        _checkCaps(t, caps, f.keyId);
        f.caps = caps;
        emit CapsUpdated(msg.sender, themeId, caps);
    }

    /// @notice Stops the agent; holdings stay in the follower's wallet (TH-12). Revoking the key is the follower's
    ///         own keychain call.
    function unfollow(uint64 themeId) external {
        _rootOnly();
        Follow storage f = _follows[msg.sender][themeId];
        if (!f.active) revert NotFollowing();
        f.active = false;
        emit Unfollowed(msg.sender, themeId);
    }

    // ─── rebalance (the agent's key, or the follower's root) ───

    function rebalance(uint64 themeId, Trade[] calldata trades, bytes calldata priceProof, bytes32 decisionId) external {
        Follow storage f = _follows[msg.sender][themeId];
        address txKey = KEYCHAIN.getTransactionKey();
        bool root = txKey == address(0);
        if (!root && txKey != f.keyId) revert WrongKey();
        if (!f.active) revert NotFollowing();
        Theme memory t = registry.theme(themeId);
        if (f.version != t.version) revert VersionMismatch();
        if (!root && block.timestamp > f.caps.expiry) revert FollowExpired();
        uint256 interval = root || t.minIntervalSec >= f.caps.minIntervalSec ? t.minIntervalSec : f.caps.minIntervalSec;
        if (f.lastRebalanceAt != 0 && block.timestamp < f.lastRebalanceAt + interval) revert TooSoon();
        if (trades.length == 0 || trades.length > MAX_LEGS) revert BadTrades();
        if (priceProof.length != 0) _pushProof(priceProof);
        uint8 session = oracle.currentSession();
        if ((t.sessionsMask >> session) & 1 == 0) revert SessionNotAllowed(session);

        (uint256[] memory prices, PoolKey[] memory keys, uint256 feeBase) = _prepare(themeId, t, trades);
        _inFlight = msg.sender;
        uint256[] memory outs = abi.decode(poolManager.unlock(abi.encode(msg.sender, trades, keys)), (uint256[]));
        _inFlight = address(0);
        uint16 slip = root || t.maxSlippageBps <= f.caps.maxSlippageBps ? t.maxSlippageBps : f.caps.maxSlippageBps;
        uint256 notional = _checkLegs(trades, prices, outs, slip, root ? type(uint64).max : f.caps.maxTradeUsd);
        if (!root) {
            _chargeDaily(f, notional);
            _checkEnvelope(themeId, t.version, trades, prices, f.caps.allocationUsd);
        }
        uint256 fee = (feeBase * t.creatorFeeBps) / C.BPS;
        if (fee != 0) {
            if (!ITIP20(C.PATH_USD).transferFrom(msg.sender, address(this), fee)) revert TransferFailed();
            feesOwed[t.creator] += fee;
            totalFeesOwed += fee;
        }
        _checkAllowancesConsumed(trades, fee);
        f.lastRebalanceAt = uint48(block.timestamp);
        emit Rebalanced(msg.sender, themeId, decisionId, t.version, txKey, notional, fee);
    }

    /// @notice PoolManager callback: swap every leg, then take outputs to the follower, then settle inputs.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        (address follower, Trade[] memory trades, PoolKey[] memory keys) = abi.decode(data, (address, Trade[], PoolKey[]));
        if (follower == address(0) || follower != _inFlight) revert OnlyPoolManager();
        uint256[] memory outs = new uint256[](trades.length);
        for (uint256 i; i < trades.length; ++i) {
            bool zeroForOne = trades[i].tokenIn == C.PATH_USD; // pathUSD is always currency0
            BalanceDelta d = poolManager.swap(
                keys[i],
                SwapParams({
                    zeroForOne: zeroForOne,
                    amountSpecified: -int256(uint256(trades[i].amountIn)),
                    sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
                }),
                ""
            );
            (int128 inD, int128 outD) = zeroForOne ? (d.amount0(), d.amount1()) : (d.amount1(), d.amount0());
            if (inD >= 0 || uint128(-inD) != trades[i].amountIn || outD < 0) revert PartialFill(i);
            outs[i] = uint128(outD);
        }
        for (uint256 i; i < trades.length; ++i) _take(trades[i].tokenOut, follower, outs[i]);
        for (uint256 i; i < trades.length; ++i) _settle(trades[i].tokenIn, follower, trades[i].amountIn);
        return abi.encode(outs);
    }

    // ─── creators ───

    function claimFees() external {
        uint256 amount = feesOwed[msg.sender];
        if (amount == 0) revert NothingOwed();
        feesOwed[msg.sender] = 0;
        totalFeesOwed -= amount;
        (bool ok,) = StdPrecompiles.TIP403_REGISTRY.validateReceivePolicy(C.PATH_USD, address(this), msg.sender);
        if (!ok) revert ReceiveBlocked(C.PATH_USD);
        if (!ITIP20(C.PATH_USD).transfer(msg.sender, amount)) revert TransferFailed();
        emit FeesClaimed(msg.sender, amount);
    }

    // ─── views ───

    function followOf(address follower, uint64 themeId) external view returns (Follow memory) {
        return _follows[follower][themeId];
    }

    // ─── internals ───

    function _rootOnly() internal view {
        if (KEYCHAIN.getTransactionKey() != address(0)) revert RootOnly();
    }

    function _checkCaps(Theme memory t, FollowCaps calldata caps, address keyId) internal view {
        if (
            caps.expiry <= block.timestamp || caps.allocationUsd == 0 || caps.maxTradeUsd == 0
                || caps.maxTradeUsd > caps.maxDailyUsd || caps.maxSlippageBps == 0 || caps.maxSlippageBps > C.MAX_SLIPPAGE_BPS
        ) revert BadCaps();
        if (t.creatorFeeBps > caps.maxFeeBps) revert FeeNotAccepted();
        IAccountKeychain.KeyInfo memory k = KEYCHAIN.getKey(msg.sender, keyId);
        if (keyId == address(0) || k.keyId != keyId || k.isRevoked || !k.enforceLimits || k.expiry < caps.expiry) {
            revert KeyInvalid();
        }
    }

    /// @dev Every scope must be `rebalance@router` or `approve(router)` on pathUSD / a theme token (D-100: a subset —
    ///      token scopes past the fifth may arrive in later `setAllowedCalls` txs).
    function _checkScopes(uint64 themeId, uint32 version, address keyId) internal view {
        (bool isScoped, IAccountKeychain.CallScope[] memory scopes) = KEYCHAIN.getAllowedCalls(msg.sender, keyId);
        if (!isScoped) revert KeyUnscoped();
        for (uint256 i; i < scopes.length; ++i) {
            address target = scopes[i].target;
            IAccountKeychain.SelectorRule[] memory rules = scopes[i].selectorRules;
            if (rules.length == 0) revert ScopeNotAllowed(target);
            bool isRouter = target == address(this);
            if (!isRouter && target != C.PATH_USD) {
                (bool listed,) = registry.bandOf(themeId, version, target);
                if (!listed) revert ScopeNotAllowed(target);
            }
            for (uint256 j; j < rules.length; ++j) {
                bool ok = isRouter
                    ? rules[j].selector == this.rebalance.selector
                    : rules[j].selector == APPROVE && rules[j].recipients.length == 1
                        && rules[j].recipients[0] == address(this);
                if (!ok) revert ScopeNotAllowed(target);
            }
        }
    }

    function _pushProof(bytes calldata proof) internal {
        if (proof.length < 4 || !proofSelectors[bytes4(proof[:4])] || proofTarget == address(0)) revert ProofRefused();
        (bool ok, bytes memory ret) = proofTarget.call(proof);
        if (!ok) {
            assembly ("memory-safe") {
                revert(add(ret, 0x20), mload(ret))
            }
        }
    }

    /// @dev Validates legs against the current version, reads fresh references and pool keys.
    ///      `feeBase` = Σ buy amountIn + Σ sell minAmountOut: known before the swap, so the key's pathUSD approval
    ///      (buys + fee) can be exact (D-101).
    function _prepare(uint64 themeId, Theme memory t, Trade[] calldata trades)
        internal
        view
        returns (uint256[] memory prices, PoolKey[] memory keys, uint256 feeBase)
    {
        prices = new uint256[](trades.length);
        keys = new PoolKey[](trades.length);
        for (uint256 i; i < trades.length; ++i) {
            Trade calldata tr = trades[i];
            bool buy = tr.tokenIn == C.PATH_USD;
            address token = buy ? tr.tokenOut : tr.tokenIn;
            if (token == C.PATH_USD || (!buy && tr.tokenOut != C.PATH_USD) || tr.amountIn == 0) revert BadTrades();
            (bool listed, Band memory band) = registry.bandOf(themeId, t.version, token);
            if (!listed) revert TokenNotInTheme(token);
            if (buy && !band.allowed) revert BuyNotAllowed(token);
            (uint256 p, uint64 observedAt, bool halted) = oracle.tokenPrice(token);
            if (halted || p == 0 || (block.timestamp > observedAt && block.timestamp - observedAt > t.maxRefAgeSec)) {
                revert ReferenceUnusable(token);
            }
            prices[i] = p;
            keys[i] = registry.poolKeyOf(token);
            feeBase += buy ? tr.amountIn : tr.minAmountOut;
        }
    }

    /// @return notional Σ legs in pathUSD (buys: paid; sells: received)
    function _checkLegs(Trade[] calldata trades, uint256[] memory prices, uint256[] memory outs, uint16 slip, uint256 maxTrade)
        internal
        pure
        returns (uint256 notional)
    {
        for (uint256 i; i < trades.length; ++i) {
            uint256 amountIn = trades[i].amountIn;
            uint256 out = outs[i];
            if (out < trades[i].minAmountOut) revert BelowMinOut(i);
            bool buy = trades[i].tokenIn == C.PATH_USD;
            // value received vs value paid at the reference P_i, both in pathUSD base units (every token has 6 decimals)
            (uint256 got, uint256 paid) = buy ? (out * prices[i] / 1e18, amountIn) : (out, amountIn * prices[i] / 1e18);
            if (got * C.BPS < paid * (C.BPS - slip)) revert SlippageExceeded(i);
            uint256 usd = buy ? amountIn : out;
            if (usd > maxTrade) revert TradeCap(i);
            notional += usd;
        }
    }

    function _chargeDaily(Follow storage f, uint256 notional) internal {
        if (block.timestamp >= uint256(f.dayStart) + DAY) {
            f.dayStart = uint48(block.timestamp);
            f.daySpentUsd = 0;
        }
        uint256 spent = f.daySpentUsd + notional;
        if (spent > f.caps.maxDailyUsd) revert DailyCap();
        f.daySpentUsd = uint64(spent);
    }

    /// @dev For each token bought: the follower's whole holding, valued at P_i, ≤ band.max × allocation × 1.02.
    function _checkEnvelope(uint64 themeId, uint32 version, Trade[] calldata trades, uint256[] memory prices, uint256 allocation)
        internal
        view
    {
        for (uint256 i; i < trades.length; ++i) {
            if (trades[i].tokenIn != C.PATH_USD) continue;
            address token = trades[i].tokenOut;
            (, Band memory band) = registry.bandOf(themeId, version, token);
            uint256 value = ITIP20(token).balanceOf(msg.sender) * prices[i] / 1e18;
            if (value * C.BPS * 100 > uint256(band.maxBps) * allocation * ENVELOPE_SLACK_PCT) revert Envelope(token);
        }
    }

    /// @dev Exact approvals only: nothing the key approved may outlive the rebalance (N-04; a standing allowance would
    ///      let the router's `transferFrom` bypass the key's TIP-1011 limit).
    function _checkAllowancesConsumed(Trade[] calldata trades, uint256 fee) internal view {
        if (fee != 0 && ITIP20(C.PATH_USD).allowance(msg.sender, address(this)) != 0) revert AllowanceLeft(C.PATH_USD);
        for (uint256 i; i < trades.length; ++i) {
            address token = trades[i].tokenIn;
            if (ITIP20(token).allowance(msg.sender, address(this)) != 0) revert AllowanceLeft(token);
        }
    }

    function _take(address token, address follower, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = StdPrecompiles.TIP403_REGISTRY.validateReceivePolicy(token, address(poolManager), follower);
        if (!ok) revert ReceiveBlocked(token);
        poolManager.take(Currency.wrap(token), follower, amount);
    }

    /// @dev v4: `sync` must precede the transfer in, then `settle` credits the difference (research chain-libs §0.3).
    function _settle(address token, address follower, uint256 amount) internal virtual {
        poolManager.sync(Currency.wrap(token));
        if (!ITIP20(token).transferFrom(follower, address(poolManager), amount)) revert TransferFailed();
        poolManager.settle();
    }
}
