// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {LiquidityAmounts} from "v4-periphery/libraries/LiquidityAmounts.sol";
import {LaunchRegistry} from "../../../src/launch/LaunchRegistry.sol";
import {CurveLaunchpad} from "../../../src/launch/CurveLaunchpad.sol";
import {LiquidityLocker} from "../../../src/launch/LiquidityLocker.sol";
import {CurveConfigLib} from "../../../src/launch/CurveConfigLib.sol";
import {Segment, FeeSchedule, LpSplit, ConfigParams, LaunchState} from "../../../src/launch/CurveTypes.sol";
import {IPositionManagerLite, PoolKeyLite} from "../../../src/launch/interfaces/ILaunchDeps.sol";
import {PositionManagerFixture} from "../../lib/PositionManagerFixture.sol";

/// `GraduationLive` (plan B.6 forks): the whole memecoin lifecycle against the REAL v4 deployments — the Moderato
/// replay and the official Tempo mainnet stack — on forks: create → buys → Complete → graduate (a squatter has
/// pre-initialised the tier-0 pool with pathUSD liquidity) → swaps through the pinned UniversalRouter `0xa2dc…ea91`
/// with the 5-field `ExactInputSingleParams` (D-064) → locker fee claim and unlocked withdrawal. Also pins the
/// PositionManager fixture used by the unit tests to Moderato's code.
/// Run: `forge test --match-contract CurveGraduationForkTest` (network; excluded from `contracts:test`).
contract CurveGraduationForkTest is Test {
    uint256 constant MODERATO_BLOCK = 37_377_615;
    uint256 constant MAINNET_BLOCK = 41_758_268;
    address constant PM = 0x33620f62C5b9B2086dD6b62F4A297A9f30347029;
    IPositionManagerLite constant POSM = IPositionManagerLite(0x3Fc79444F8EACc1894775493Ff3Fa41f1e35Ce11);
    address constant UR = 0xA2Dc7d0266f0CC50b3eEaF36c9BFCeCFF1BEea91;
    IAllowanceTransfer constant PERMIT2 = IAllowanceTransfer(0x000000000022D473030F116dDEE9F6B43aC78BA3);
    ITIP20 constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);
    /// Holds test pathUSD on Moderato (our launch lane key); on mainnet the PoolManager's own pathUSD funds the fork.
    address constant MODERATO_FUNDER = 0x64B70CDD6dC30C3ff3eB79493ba17487a1071c96;

    struct SingleV0 {
        PoolKey poolKey;
        bool zeroForOne;
        uint128 amountIn;
        uint128 amountOutMinimum;
        bytes hookData;
    }

    LaunchRegistry registry;
    LiquidityLocker locker;
    CurveLaunchpad pad;
    address partner = makeAddr("partner");
    address creator = makeAddr("creator");
    address trader = makeAddr("trader");
    address squatter = makeAddr("squatter");

    function test_positionManagerFixture_matchesModerato() public {
        vm.createSelectFork(vm.envOr("TEMPO_RPC_HTTP_URL", string("https://rpc.moderato.tempo.xyz")), MODERATO_BLOCK);
        assertEq(keccak256(address(POSM).code), PositionManagerFixture.CODEHASH);
    }

    function test_lifecycle_moderato() public {
        vm.createSelectFork(vm.envOr("TEMPO_RPC_HTTP_URL", string("https://rpc.moderato.tempo.xyz")), MODERATO_BLOCK);
        _lifecycle(MODERATO_FUNDER);
    }

    function test_lifecycle_tempoMainnet() public {
        vm.createSelectFork(vm.envOr("TEMPO_MAINNET_RPC_HTTP_URL", string("https://rpc.tempo.xyz")), MAINNET_BLOCK);
        _lifecycle(PM); // fork-only transfer out of the PoolManager's ≈ 10M pathUSD; no mainnet write
    }

    function _lifecycle(address funder) internal {
        address[4] memory who = [creator, trader, squatter, partner];
        for (uint256 i; i < 4; i++) {
            vm.prank(funder);
            PATH_USD.transfer(who[i], 30_000e6);
        }
        registry = new LaunchRegistry(address(this));
        locker = new LiquidityLocker(address(this));
        pad = new CurveLaunchpad(address(this), address(registry), address(locker), address(this));
        registry.setCurveLaunchpad(address(pad));
        locker.setLaunchpad(address(pad));

        vm.prank(partner);
        uint32 id = pad.createConfig(_params());
        vm.prank(creator);
        address token = pad.createLaunch(id, "Fork Coin", "FORKC", "", "", keccak256("fork"), 0, 0);

        // A squatter initialises tier 0 far from the curve's price and parks pathUSD above it.
        PoolKey memory key0 = _key(token, 10_000, 200);
        uint160 low = 2505414483750479311864138015696; // v4 price 1,000 coin per pathUSD
        vm.prank(squatter);
        POSM.initializePool(PoolKeyLite(address(PATH_USD), token, 10_000, 200, address(0)), low);
        _squat(key0, token, id, 300e6);

        vm.warp(block.timestamp + 1 hours);
        _buy(trader, token, 2_000e6);
        _buy(creator, token, 20_000e6);
        assertEq(uint8(pad.getLaunch(token).state), uint8(LaunchState.Complete));

        vm.prank(makeAddr("keeper"));
        uint256 positionId = pad.graduate(token);
        uint160 target = CurveConfigLib.v4SqrtPrice(pad.getConfig(id).sqrtEndX96);
        (uint160 sqrtNow,,,) = StateLibrary.getSlot0(IPoolManager(PM), key0.toId());
        assertEq(sqrtNow, target, "poisoned tier corrected to the curve price");
        assertEq(POSM.ownerOf(positionId), address(locker));
        assertEq(ITIP20(token).transferPolicyId(), 1);
        assertFalse(ITIP20RolesAuth(token).hasRole(address(pad), bytes32(0)));

        // Swaps through the pinned UniversalRouter, both directions.
        uint256 coinOut = _urSwap(trader, key0, true, 500e6, address(PATH_USD), token);
        assertGt(coinOut, 0);
        assertGt(_urSwap(trader, key0, false, uint128(coinOut / 2), token, address(PATH_USD)), 0);

        // Locker: LP fees and the creator's unlocked bucket.
        vm.prank(creator);
        (uint256 fq, uint256 fc) = locker.claimFees(token);
        assertGt(fq + fc, 0);
        vm.prank(creator);
        (uint256 wq, uint256 wc) = locker.withdraw(token, LiquidityLocker.Bucket.CreatorUnlocked);
        assertGt(wq, 0);
        assertGt(wc, 0);
    }

    function _params() internal pure returns (ConfigParams memory p) {
        Segment[] memory segs = new Segment[](1);
        segs[0] = Segment(306849353968360525628702781, 2088421434088);
        p.protocolShareBps = 2_000;
        p.partnerShareBps = 3_000;
        p.creatorShareBps = 5_000;
        p.fees = FeeSchedule({base: 100, start: 5_000, period: 10, reduction: 490, mode: 0});
        p.sqrtStartX96 = 79228162514264337593543950;
        p.segments = segs;
        p.migrationQuoteThreshold = 5_000e6;
        p.totalSupply = 2_000_000_000e6;
        p.migrationFeeBps = 100;
        p.split = LpSplit(1_000, 1_000, 1_000, 2_000, 2_000, 3_000);
        p.vestingCliff = 1 days;
        p.vestingDuration = 30 days;
        p.leftoverReceiver = address(0xBEEF);
        p.poolFees = [uint24(10_000), uint24(3_000), uint24(500)];
        p.tickSpacings = [int24(200), int24(60), int24(10)];
        p.maxCreatorBuyBps = 500;
    }

    function _key(address token, uint24 fee, int24 ts) internal pure returns (PoolKey memory) {
        return PoolKey(Currency.wrap(address(PATH_USD)), Currency.wrap(token), fee, ts, IHooks(address(0)));
    }

    function _buy(address who, address token, uint256 quote) internal {
        vm.startPrank(who);
        PATH_USD.approve(address(pad), quote);
        pad.buy(token, quote, 0);
        vm.stopPrank();
    }

    function _squat(PoolKey memory key, address token, uint32 id, uint256 amount) internal {
        (, int24 tick,,) = StateLibrary.getSlot0(IPoolManager(PM), key.toId());
        int24 lower = (tick / 200 + 1) * 200;
        int24 upper = (TickMath.getTickAtSqrtPrice(CurveConfigLib.v4SqrtPrice(pad.getConfig(id).sqrtEndX96)) / 200) * 200;
        uint128 liq = LiquidityAmounts.getLiquidityForAmount0(TickMath.getSqrtPriceAtTick(lower), TickMath.getSqrtPriceAtTick(upper), amount);
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(key, lower, upper, uint256(liq), uint128(amount), uint128(0), squatter, bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1);
        vm.startPrank(squatter);
        PATH_USD.approve(address(PERMIT2), amount);
        PERMIT2.approve(address(PATH_USD), address(POSM), uint160(amount), uint48(block.timestamp + 60));
        POSM.modifyLiquidities(abi.encode(abi.encodePacked(uint8(0x02), uint8(0x0d)), params), block.timestamp + 60);
        vm.stopPrank();
        token; // the coin side is refused by the curve policy; only pathUSD could be parked
    }

    /// `[token.approve(Permit2), Permit2.approve(token, UR), UR.execute(V4_SWAP)]` — the batch `encode.ts` builds.
    function _urSwap(address who, PoolKey memory key, bool zeroForOne, uint128 amountIn, address cin, address cout)
        internal
        returns (uint256 out)
    {
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(SingleV0(key, zeroForOne, amountIn, 1, ""));
        params[1] = abi.encode(cin, uint256(amountIn));
        params[2] = abi.encode(cout, uint256(1));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(abi.encodePacked(uint8(0x06), uint8(0x0c), uint8(0x0f)), params);
        uint256 before = ITIP20(cout).balanceOf(who);
        vm.startPrank(who);
        ITIP20(cin).approve(address(PERMIT2), amountIn);
        PERMIT2.approve(cin, UR, amountIn, uint48(block.timestamp + 60));
        (bool ok, bytes memory err) = UR.call(
            abi.encodeWithSignature("execute(bytes,bytes[],uint256)", abi.encodePacked(uint8(0x10)), inputs, block.timestamp + 60)
        );
        vm.stopPrank();
        assertTrue(ok, string(err));
        out = ITIP20(cout).balanceOf(who) - before;
    }
}
