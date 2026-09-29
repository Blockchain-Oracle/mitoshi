// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {LaunchRegistry} from "../../../src/launch/LaunchRegistry.sol";
import {CurveLaunchpad} from "../../../src/launch/CurveLaunchpad.sol";
import {LiquidityLocker} from "../../../src/launch/LiquidityLocker.sol";
import {Segment, FeeSchedule, LpSplit, ConfigParams, Config} from "../../../src/launch/CurveTypes.sol";
import {PoolManagerFixture} from "../../lib/PoolManagerFixture.sol";
import {PositionManagerFixture} from "../../lib/PositionManagerFixture.sol";
import {IPositionManagerLite, PoolKeyLite} from "../../../src/launch/interfaces/ILaunchDeps.sol";

/// An exact-input v4 swapper (`sync → transfer → settle`, `take` to the caller), standing in for the UR locally.
contract V4Swapper is IUnlockCallback {
    IPoolManager constant PM = IPoolManager(PoolManagerFixture.ADDRESS);

    function swap(PoolKey memory key, bool zeroForOne, uint256 amountIn) external returns (uint256 out) {
        (address cin,) = zeroForOne ? (Currency.unwrap(key.currency0), 0) : (Currency.unwrap(key.currency1), 0);
        ITIP20(cin).transferFrom(msg.sender, address(this), amountIn);
        bytes memory r = PM.unlock(abi.encode(key, zeroForOne, amountIn, msg.sender));
        out = abi.decode(r, (uint256));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        (PoolKey memory key, bool zeroForOne, uint256 amountIn, address to) = abi.decode(data, (PoolKey, bool, uint256, address));
        uint160 limit = zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1;
        BalanceDelta d = PM.swap(key, SwapParams(zeroForOne, -int256(amountIn), limit), "");
        (Currency cin, Currency cout) = zeroForOne ? (key.currency0, key.currency1) : (key.currency1, key.currency0);
        int128 paid = zeroForOne ? d.amount0() : d.amount1();
        int128 got = zeroForOne ? d.amount1() : d.amount0();
        PM.sync(cin);
        ITIP20(Currency.unwrap(cin)).transfer(address(PM), uint256(uint128(-paid)));
        PM.settle();
        PM.take(cout, to, uint256(uint128(got)));
        return abi.encode(uint256(uint128(got)));
    }
}

/// Shared fixture for the launchpad suites: the mainnet PoolManager and the Moderato PositionManager runtimes etched at
/// their addresses (never compiled), Permit2 from the local Tempo genesis, and our registry, locker and launchpad.
abstract contract LaunchBase is Test {
    ITIP20 constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);
    IAllowanceTransfer constant PERMIT2 = IAllowanceTransfer(0x000000000022D473030F116dDEE9F6B43aC78BA3);
    IPositionManagerLite constant POSM = IPositionManagerLite(PositionManagerFixture.ADDRESS);
    IPoolManager pm;

    LaunchRegistry registry;
    LiquidityLocker locker;
    CurveLaunchpad pad;
    V4Swapper swapper;

    address treasury = makeAddr("treasury");
    address partner = makeAddr("partner");
    address creator = makeAddr("creator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address whale = makeAddr("whale");
    address leftoverReceiver = makeAddr("leftover");
    address keeper = makeAddr("keeper");

    /// √(1e-6)·2^96 and √(15e-6)·2^96: $0.000001 → $0.000015 per coin (one segment).
    uint160 constant SQRT_START = 79228162514264337593543950;
    uint160 constant SQRT_UPPER = 306849353968360525628702781;
    uint256 constant THRESHOLD = 5_000e6;
    uint128 constant LIQ = 2088421434088; // takes ≈ 6,000 pathUSD over [start, upper]

    function setUp() public virtual {
        pm = IPoolManager(PoolManagerFixture.etch());
        PositionManagerFixture.etch();
        registry = new LaunchRegistry(address(this));
        locker = new LiquidityLocker(address(this));
        pad = new CurveLaunchpad(address(this), address(registry), address(locker), treasury);
        registry.setCurveLaunchpad(address(pad));
        locker.setLaunchpad(address(pad));
        swapper = new V4Swapper();
        address[5] memory funded = [alice, bob, whale, creator, partner];
        for (uint256 i; i < funded.length; i++) PATH_USD.transfer(funded[i], 100_000e6);
    }

    function _params() internal view returns (ConfigParams memory p) {
        Segment[] memory segs = new Segment[](1);
        segs[0] = Segment(SQRT_UPPER, LIQ);
        p.protocolShareBps = 2_000;
        p.partnerShareBps = 3_000;
        p.creatorShareBps = 5_000;
        p.fees = FeeSchedule({base: 100, start: 5_000, period: 10, reduction: 490, mode: 0});
        p.sqrtStartX96 = SQRT_START;
        p.segments = segs;
        p.migrationQuoteThreshold = THRESHOLD;
        p.totalSupply = 2_000_000_000e6;
        p.migrationFeeBps = 100;
        p.split = LpSplit({partnerUnlocked: 1_000, partnerLocked: 1_000, partnerVesting: 1_000, creatorUnlocked: 2_000, creatorLocked: 2_000, creatorVesting: 3_000});
        p.vestingCliff = 1 days;
        p.vestingDuration = 30 days;
        p.leftoverReceiver = leftoverReceiver;
        p.poolFees = [uint24(10_000), uint24(3_000), uint24(500)];
        p.tickSpacings = [int24(200), int24(60), int24(10)];
        p.maxCreatorBuyBps = 500;
    }

    function _config() internal returns (uint32 id) {
        vm.prank(partner);
        id = pad.createConfig(_params());
    }

    function _launch(uint32 id, string memory symbol) internal returns (address token) {
        vm.prank(creator);
        token = pad.createLaunch(id, "Test Coin", symbol, "", "https://testnet.mitoshi.xyz/launch/x", keccak256(bytes(symbol)), 0, 0);
    }

    function _buy(address who, address token, uint256 quote) internal returns (uint256 coin, uint256 paid) {
        vm.startPrank(who);
        PATH_USD.approve(address(pad), quote);
        (coin, paid) = pad.buy(token, quote, 0);
        vm.stopPrank();
    }

    function _sell(address who, address token, uint256 coin) internal returns (uint256 out) {
        vm.startPrank(who);
        ITIP20(token).approve(address(pad), coin);
        out = pad.sell(token, coin, 0);
        vm.stopPrank();
    }

    /// The whale buys until the launch is Complete (after the anti-snipe window).
    function _complete(address token) internal {
        vm.warp(block.timestamp + 1 hours);
        _buy(whale, token, 20_000e6);
        require(uint8(pad.getLaunch(token).state) == 2, "not complete");
    }

    function _key(address token, uint8 tier) internal view returns (PoolKey memory) {
        Config memory c = pad.getConfig(pad.getLaunch(token).configId);
        return PoolKey(Currency.wrap(address(PATH_USD)), Currency.wrap(token), c.poolFees[tier], c.tickSpacings[tier], IHooks(address(0)));
    }

    function _lite(PoolKey memory k) internal pure returns (PoolKeyLite memory) {
        return PoolKeyLite(Currency.unwrap(k.currency0), Currency.unwrap(k.currency1), k.fee, k.tickSpacing, address(k.hooks));
    }
}
