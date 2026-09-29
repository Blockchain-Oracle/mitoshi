// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {ITIP403Registry} from "tempo-std/interfaces/ITIP403Registry.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {Segment, FeeSchedule, Config, ConfigParams, Launch, LaunchState, Graduation} from "./CurveTypes.sol";
import {CurveMath} from "./CurveMath.sol";
import {CurveConfigLib} from "./CurveConfigLib.sol";
import {CurveGraduationLib, Ledger} from "./CurveGraduationLib.sol";
import {ILaunchRegistryForCurve} from "./interfaces/ILaunchDeps.sol";

/// @title CurveLaunchpad
/// @notice The memecoin launchpad (plan B.5.2, D-024): one singleton holding per-launch state. A partner publishes a
///         template (`createConfig`); a creator launches a TIP-20 from it (`createLaunch`) whose currency is its symbol
///         (reserved fiat codes and stock tickers refused); traders `buy`/`sell` against the curve, which mints on buy
///         and burns on sell; when the reserve reaches the threshold the launch is Complete and anyone may `graduate`
///         it into a hookless Uniswap v4 pool whose full-range position the LiquidityLocker holds. Until then a
///         compound TIP-403 policy keeps the coin out of the PoolManager, so nobody can seed the migration pool (X5).
/// @dev Payouts go to `msg.sender` only, each after a receive-policy pre-check (TIP-1028 would otherwise redirect
///      them to the ReceivePolicyGuard). Nothing is payable. Graduation runs in `CurveGraduationLib` (delegatecall).
contract CurveLaunchpad is Ownable2Step, ReentrancyGuardTransient {
    ITIP20 public constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);
    address public constant POOL_MANAGER = CurveGraduationLib.POOL_MANAGER;
    ITIP403Registry internal constant TIP403 = StdPrecompiles.TIP403_REGISTRY;
    /// @dev TIP-403 built-in policy 1 = always allow.
    uint64 internal constant ALLOW_ALL = 1;

    ILaunchRegistryForCurve public immutable registry;
    address public immutable locker;
    /// @notice Blacklist {PoolManager} (admin: this contract, never modified).
    uint64 public immutable poolManagerBlacklistId;
    /// @notice The pre-graduation policy: compound (senders 1, recipients and mint recipients ¬PoolManager).
    uint64 public immutable curvePolicyId;

    address public protocolTreasury;
    uint16 public minProtocolShareBps;
    uint32 public configCount;

    mapping(uint32 configId => Config) internal _configs;
    mapping(uint32 configId => Segment[]) internal _segments;
    mapping(address token => Launch) internal _launches;
    mapping(address token => Graduation) internal _graduations;
    Ledger internal _ledger;

    event ConfigCreated(uint32 indexed configId, address indexed partner, uint160 sqrtEndX96, uint256 curveSupply, uint256 migrationCoinAmount);
    event LaunchCreated(address indexed token, address indexed creator, uint32 indexed configId, string symbol);
    event Trade(address indexed token, address indexed trader, bool isBuy, uint256 quote, uint256 coin, uint256 fee, uint160 sqrtPriceX96, uint256 quoteReserve);
    event Completed(address indexed token, uint256 quoteReserve);
    event FeesClaimed(address indexed account, uint256 amount);
    event LeftoverClaimed(address indexed token, address indexed receiver, uint256 amount);
    event ProtocolTreasurySet(address treasury);
    event MinProtocolShareSet(uint16 bps);

    error UnknownConfig(uint32 configId);
    error ReservedCode(string code);
    error NotTrading(address token);
    error NotComplete(address token);
    error NotGraduated(address token);
    error Slippage(uint256 got, uint256 min);
    error ZeroTrade();
    error CreatorBuyTooLarge(uint256 coin, uint256 max);
    error ReceivePolicyBlocks(address token, address recipient);
    error NotLeftoverReceiver(address caller);
    error NotPoolManager(address caller);
    error NothingToClaim();
    error ZeroAddress();
    error BadShare();

    constructor(address initialOwner, address registry_, address locker_, address treasury) Ownable(initialOwner) {
        if (registry_ == address(0) || locker_ == address(0) || treasury == address(0)) revert ZeroAddress();
        registry = ILaunchRegistryForCurve(registry_);
        locker = locker_;
        protocolTreasury = treasury;
        minProtocolShareBps = 2_000;
        address[] memory pm = new address[](1);
        pm[0] = POOL_MANAGER;
        uint64 blacklist = TIP403.createPolicyWithAccounts(address(this), ITIP403Registry.PolicyType.BLACKLIST, pm);
        poolManagerBlacklistId = blacklist;
        curvePolicyId = TIP403.createCompoundPolicy(ALLOW_ALL, blacklist, blacklist);
    }

    // ── templates and launches ────────────────────────────────────────────────────────────────────────────────────

    /// @notice Publishes a launch template; the caller is its partner (fee share, LP buckets).
    function createConfig(ConfigParams calldata p) external returns (uint32 configId) {
        configId = ++configCount;
        Config storage c = _configs[configId];
        CurveConfigLib.store(c, _segments[configId], p, msg.sender, minProtocolShareBps);
        emit ConfigCreated(configId, msg.sender, c.sqrtEndX96, c.curveSupply, c.migrationCoinAmount);
    }

    /// @notice Creates a memecoin from `configId`. The TIP-20's currency is its symbol; the launchpad is its admin and
    ///         issuer until graduation. `creatorBuyQuote` > 0 buys for the creator in the same call (at the base fee,
    ///         at most `maxCreatorBuyBps` of the curve supply).
    function createLaunch(
        uint32 configId,
        string calldata name,
        string calldata symbol,
        string calldata logoURI,
        string calldata metadataURI,
        bytes32 salt,
        uint256 creatorBuyQuote,
        uint256 minCoinOut
    ) external nonReentrant returns (address token) {
        Config storage c = _configs[configId];
        if (c.partner == address(0)) revert UnknownConfig(configId);
        if (registry.isReservedCode(symbol)) revert ReservedCode(symbol);
        token = StdPrecompiles.TIP20_FACTORY.createToken(
            name, symbol, symbol, PATH_USD, address(this), keccak256(abi.encode(msg.sender, salt)), logoURI
        );
        ITIP20RolesAuth(token).grantRole(ITIP20(token).ISSUER_ROLE(), address(this));
        ITIP20(token).changeTransferPolicyId(curvePolicyId);
        ITIP20(token).setSupplyCap(c.totalSupply);
        _launches[token] = Launch({
            token: token,
            configId: configId,
            state: LaunchState.Trading,
            createdAt: uint40(block.timestamp),
            segment: 0,
            sqrtPriceX96: c.sqrtStartX96,
            quoteReserve: 0,
            coinSold: 0,
            creator: msg.sender
        });
        registry.recordMemecoin(token, msg.sender, metadataURI);
        emit LaunchCreated(token, msg.sender, configId, symbol);
        if (creatorBuyQuote != 0) {
            (uint256 coinOut,) = _buy(token, creatorBuyQuote, minCoinOut, c.fees.base);
            uint256 maxCoin = c.curveSupply * c.maxCreatorBuyBps / CurveMath.BPS;
            if (coinOut > maxCoin) revert CreatorBuyTooLarge(coinOut, maxCoin);
        }
    }

    // ── trading ───────────────────────────────────────────────────────────────────────────────────────────────────

    /// @notice Buys coin with at most `quoteIn` pathUSD (fee included); a buy that reaches the end is clipped and
    ///         charged only for what it used. The coin is minted to `msg.sender`.
    function buy(address token, uint256 quoteIn, uint256 minCoinOut) external nonReentrant returns (uint256 coinOut, uint256 quotePaid) {
        Launch storage l = _launches[token];
        if (l.state != LaunchState.Trading) revert NotTrading(token);
        return _buy(token, quoteIn, minCoinOut, currentFeeBps(token));
    }

    /// @notice Sells `coinIn` back to the curve; pathUSD (after the fee) goes to `msg.sender`. Needs an allowance.
    function sell(address token, uint256 coinIn, uint256 minQuoteOut) external nonReentrant returns (uint256 quoteOut) {
        Launch storage l = _launches[token];
        if (l.state != LaunchState.Trading) revert NotTrading(token);
        if (coinIn == 0) revert ZeroTrade();
        Config storage c = _configs[l.configId];
        (uint256 gross, uint160 sqrtNext, uint256 segNext) =
            CurveMath.sell(_segments[l.configId], c.sqrtStartX96, l.sqrtPriceX96, l.segment, coinIn);
        uint256 fee = CurveMath.feeOn(gross, currentFeeBps(token));
        quoteOut = gross - fee;
        if (quoteOut == 0 || quoteOut < minQuoteOut) revert Slippage(quoteOut, minQuoteOut);
        _checkReceive(address(PATH_USD), msg.sender);

        l.quoteReserve -= gross;
        l.coinSold -= coinIn;
        l.sqrtPriceX96 = sqrtNext;
        l.segment = uint8(segNext);
        _ledger.totalReserve -= gross;
        _credit(c, l.creator, fee);

        ITIP20(token).transferFrom(msg.sender, address(this), coinIn);
        ITIP20(token).burn(coinIn);
        PATH_USD.transfer(msg.sender, quoteOut);
        emit Trade(token, msg.sender, false, quoteOut, coinIn, fee, sqrtNext, l.quoteReserve);
    }

    /// @notice Graduates a Complete launch into Uniswap v4 (permissionless; the launch keeper calls it).
    function graduate(address token) external nonReentrant returns (uint256 positionId) {
        Launch storage l = _launches[token];
        if (l.state != LaunchState.Complete) revert NotComplete(token);
        return CurveGraduationLib.graduate(l, _configs[l.configId], _graduations[token], _ledger, protocolTreasury, locker);
    }

    /// @dev The corrective swap's callback while graduating (`CurveGraduationLib` checks it is expected).
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != POOL_MANAGER) revert NotPoolManager(msg.sender);
        return CurveGraduationLib.onUnlock(data);
    }

    // ── claims (msg.sender only) ──────────────────────────────────────────────────────────────────────────────────

    /// @notice Pays the caller's accrued pathUSD fees (trading fees, migration fees, graduation residue).
    function claimFees() external nonReentrant returns (uint256 amount) {
        amount = _ledger.owed[msg.sender];
        if (amount == 0) revert NothingToClaim();
        _checkReceive(address(PATH_USD), msg.sender);
        _ledger.owed[msg.sender] = 0;
        _ledger.totalOwed -= amount;
        PATH_USD.transfer(msg.sender, amount);
        emit FeesClaimed(msg.sender, amount);
    }

    /// @notice Pays the unsold supply minted at graduation to the config's leftover receiver.
    function claimLeftover(address token) external nonReentrant returns (uint256 amount) {
        Launch storage l = _launches[token];
        if (l.state != LaunchState.Graduated) revert NotGraduated(token);
        if (msg.sender != _configs[l.configId].leftoverReceiver) revert NotLeftoverReceiver(msg.sender);
        amount = _graduations[token].leftover;
        if (amount == 0) revert NothingToClaim();
        _checkReceive(token, msg.sender);
        _graduations[token].leftover = 0;
        ITIP20(token).transfer(msg.sender, amount);
        emit LeftoverClaimed(token, msg.sender, amount);
    }

    // ── owner ─────────────────────────────────────────────────────────────────────────────────────────────────────

    function setProtocolTreasury(address treasury) external onlyOwner {
        if (treasury == address(0)) revert ZeroAddress();
        protocolTreasury = treasury;
        emit ProtocolTreasurySet(treasury);
    }

    /// @notice Applies to configs created afterwards only.
    function setMinProtocolShare(uint16 bps) external onlyOwner {
        if (bps > CurveMath.BPS) revert BadShare();
        minProtocolShareBps = bps;
        emit MinProtocolShareSet(bps);
    }

    // ── views ─────────────────────────────────────────────────────────────────────────────────────────────────────

    function getConfig(uint32 configId) external view returns (Config memory) {
        return _configs[configId];
    }

    function getSegments(uint32 configId) external view returns (Segment[] memory) {
        return _segments[configId];
    }

    function getLaunch(address token) external view returns (Launch memory) {
        return _launches[token];
    }

    function getGraduation(address token) external view returns (Graduation memory) {
        return _graduations[token];
    }

    function feesOwed(address account) external view returns (uint256) {
        return _ledger.owed[account];
    }

    /// @return totalReserve Σ quote reserves of launches not yet graduated
    /// @return totalOwed Σ fees owed to every account
    function totals() external view returns (uint256 totalReserve, uint256 totalOwed) {
        return (_ledger.totalReserve, _ledger.totalOwed);
    }

    /// @notice The anti-snipe fee a trade would pay now.
    function currentFeeBps(address token) public view returns (uint256) {
        Launch storage l = _launches[token];
        return CurveMath.feeBps(_configs[l.configId].fees, block.timestamp - l.createdAt);
    }

    /// @notice What `buy(token, quoteIn, 0)` would do now.
    function quoteBuy(address token, uint256 quoteIn) external view returns (uint256 coinOut, uint256 quotePaid, uint256 fee) {
        Launch storage l = _launches[token];
        uint256 bps = currentFeeBps(token);
        uint256 net = quoteIn - CurveMath.feeOn(quoteIn, bps);
        uint256 used;
        (coinOut, used,,) =
            CurveMath.buy(_segments[l.configId], _configs[l.configId].sqrtEndX96, l.sqrtPriceX96, l.segment, net);
        quotePaid = used == net ? quoteIn : _min(CurveMath.grossFor(used, bps), quoteIn);
        fee = quotePaid - used;
    }

    /// @notice What `sell(token, coinIn, 0)` would pay now.
    function quoteSell(address token, uint256 coinIn) external view returns (uint256 quoteOut, uint256 fee) {
        Launch storage l = _launches[token];
        (uint256 gross,,) =
            CurveMath.sell(_segments[l.configId], _configs[l.configId].sqrtStartX96, l.sqrtPriceX96, l.segment, coinIn);
        fee = CurveMath.feeOn(gross, currentFeeBps(token));
        quoteOut = gross - fee;
    }

    // ── internals ─────────────────────────────────────────────────────────────────────────────────────────────────

    function _buy(address token, uint256 quoteIn, uint256 minCoinOut, uint256 bps) internal returns (uint256 coinOut, uint256 quotePaid) {
        Launch storage l = _launches[token];
        Config storage c = _configs[l.configId];
        uint256 net = quoteIn - CurveMath.feeOn(quoteIn, bps);
        (uint256 out, uint256 used, uint160 sqrtNext, uint256 segNext) =
            CurveMath.buy(_segments[l.configId], c.sqrtEndX96, l.sqrtPriceX96, l.segment, net);
        coinOut = out;
        if (coinOut == 0 || coinOut < minCoinOut) revert Slippage(coinOut, minCoinOut);
        quotePaid = used == net ? quoteIn : _min(CurveMath.grossFor(used, bps), quoteIn);
        _checkReceive(token, msg.sender);

        l.quoteReserve += used;
        l.coinSold += coinOut;
        l.sqrtPriceX96 = sqrtNext;
        l.segment = uint8(segNext);
        _ledger.totalReserve += used;
        _credit(c, l.creator, quotePaid - used);

        PATH_USD.transferFrom(msg.sender, address(this), quotePaid);
        ITIP20(token).mint(msg.sender, coinOut);
        emit Trade(token, msg.sender, true, quotePaid, coinOut, quotePaid - used, sqrtNext, l.quoteReserve);
        if (sqrtNext == c.sqrtEndX96) {
            l.state = LaunchState.Complete;
            emit Completed(token, l.quoteReserve);
        }
    }

    /// @dev Splits a pathUSD fee protocol / partner / creator (the creator takes the rounding remainder).
    function _credit(Config storage c, address creator, uint256 fee) internal {
        if (fee == 0) return;
        uint256 protocol = fee * c.protocolShareBps / CurveMath.BPS;
        uint256 partner = fee * c.partnerShareBps / CurveMath.BPS;
        _ledger.owed[protocolTreasury] += protocol;
        _ledger.owed[c.partner] += partner;
        _ledger.owed[creator] += fee - protocol - partner;
        _ledger.totalOwed += fee;
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    /// @dev TIP-1028 redirects a blocked credit to the ReceivePolicyGuard instead of reverting; refuse up front.
    function _checkReceive(address token, address recipient) internal view {
        (bool ok,) = TIP403.validateReceivePolicy(token, address(this), recipient);
        if (!ok) revert ReceivePolicyBlocks(token, recipient);
    }
}
