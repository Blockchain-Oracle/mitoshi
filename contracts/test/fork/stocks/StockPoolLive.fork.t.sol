// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Origin} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {IV4Quoter} from "v4-periphery/interfaces/IV4Quoter.sol";
import {StockSyncCodec as C} from "../../../src/common/StockSyncCodec.sol";
import {StockSyncReceiver} from "../../../src/stocks/StockSyncReceiver.sol";
import {StockReference} from "../../../src/stocks/StockReference.sol";
import {SessionState} from "../../../src/stocks/interfaces/IStockReference.sol";
import {StockGuardHook} from "../../../src/stocks/hooks/StockGuardHook.sol";
import {GuardTypes as T} from "../../../src/stocks/hooks/GuardTypes.sol";
import {GuardMath} from "../../../src/stocks/libs/GuardMath.sol";

/// B.6 `StockPoolLive`: the pools S15c created on Moderato, read from `deployments/42431/pools.json` and checked on a
/// fork of the live chain — every initialized pool sits inside the closed band of its RedStone reference, NFLX is
/// registered but uninitialized, the replayed V4Quoter's quote reverts `MultiplierUnsynced` today (no StockSync yet),
/// and once a sync is delivered through the real receiver a sell into the house bid ladder quotes while a sell past
/// the band reverts `OutOfBand` through the quoter. Run: `forge test --match-contract StockPoolLiveFork`.
contract StockPoolLiveForkTest is Test {
    using StateLibrary for IPoolManager;

    uint256 internal constant BLOCK = 37_386_450;
    IPoolManager internal constant PM = IPoolManager(0x33620f62C5b9B2086dD6b62F4A297A9f30347029);
    IV4Quoter internal constant QUOTER = IV4Quoter(0x20E6487C371a2086F841eF453F85378223DF4f4E);
    StockSyncReceiver internal constant RECEIVER = StockSyncReceiver(0xE1576984eA22F1E620CFCCa6bf6154C4b9a3693e);
    address internal constant ENDPOINT = 0xFB34352bA2e2D9cB93837bb19D36db5d93BcFC41;
    bytes32 internal constant FORWARDER = bytes32(uint256(uint160(0x895706548a1FA0C2614e9A95748e14314F6EBe2d)));
    address internal constant RH_TSLA = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;

    string internal pools;
    StockGuardHook internal hook;
    StockReference internal ref;

    function setUp() public {
        vm.createSelectFork(vm.envOr("MODERATO_RPC_URL", string("https://rpc.moderato.tempo.xyz")), BLOCK);
        pools = vm.readFile(string.concat(vm.projectRoot(), "/deployments/42431/pools.json"));
        hook = StockGuardHook(vm.parseJsonAddress(pools, ".hook"));
        ref = StockReference(address(hook.stockReference()));
    }

    function _key(string memory t) internal view returns (PoolKey memory) {
        address m = vm.parseJsonAddress(pools, string.concat(".pools.", t, ".mirror"));
        return PoolKey(Currency.wrap(0x20C0000000000000000000000000000000000000), Currency.wrap(m), 3000, 60, IHooks(address(hook)));
    }

    function test_poolsSitInsideTheirClosedBands_nflxWaits() public view {
        string[4] memory live = ["TSLA", "AMZN", "PLTR", "AMD"];
        for (uint256 i; i < 4; ++i) {
            PoolKey memory k = _key(live[i]);
            assertTrue(hook.isGuardedPool(k));
            (uint160 s,,,) = PM.getSlot0(k.toId());
            assertEq(uint256(s), vm.parseUint(vm.parseJsonString(pools, string.concat(".pools.", live[i], ".init.sqrtPriceX96"))));
            (uint256 p,,,,,) = hook.bandNow(Currency.unwrap(k.currency1));
            (uint160 lo, uint160 hi) = GuardMath.band(p, 500);
            assertTrue(s >= lo && s <= hi, live[i]);
            assertEq(PM.getLiquidity(k.toId()), 0, "no mirror inventory yet: only the pathUSD ladder, above the price");
        }
        assertGe(ITIP20(0x20C0000000000000000000000000000000000000).balanceOf(address(PM)), 80_000e6, "4 x $20k bid ladders");
        PoolKey memory nflx = _key("NFLX");
        assertTrue(hook.isGuardedPool(nflx));
        (uint160 sn,,,) = PM.getSlot0(nflx.toId());
        assertEq(sn, 0, "NFLX waits for a signed source (D-107)");
        (,,,,, T.Block b) = hook.bandNow(Currency.unwrap(nflx.currency1));
        assertEq(uint8(b), uint8(T.Block.NO_REFERENCE));
    }

    function _quoteSell(PoolKey memory k, uint128 amount) internal returns (bool ok, bytes memory err) {
        try QUOTER.quoteExactInputSingle(IV4Quoter.QuoteExactSingleParams(k, false, amount, "")) returns (uint256 out, uint256) {
            return (out > 0, "");
        } catch (bytes memory e) {
            return (false, e);
        }
    }

    function _contains(bytes memory hay, bytes4 sel) internal pure returns (bool) {
        for (uint256 i; i + 4 <= hay.length; ++i) {
            if (bytes4(hay[i]) == sel[0] && hay[i + 1] == sel[1] && hay[i + 2] == sel[2] && hay[i + 3] == sel[3]) return true;
        }
        return false;
    }

    function test_quoterRefusesUntilSynced_thenBandsTheLadder() public {
        PoolKey memory k = _key("TSLA");
        (bool ok, bytes memory err) = _quoteSell(k, 1e6);
        assertFalse(ok);
        assertTrue(_contains(err, StockGuardHook.MultiplierUnsynced.selector), "today: no StockSync delivered yet");

        // A StockSync record for TSLA (multiplier 1, not paused) arrives through the real receiver and endpoint.
        bytes memory m = bytes.concat(
            C.encodeHeader(C.Header(46630, uint64(block.timestamp), 1, 2)),
            C.encodeMultiplier(C.Multiplier(RH_TSLA, 1e18, 1e18, 1)),
            C.encodeStatus(C.Status(RH_TSLA, 0))
        );
        vm.prank(ENDPOINT);
        RECEIVER.lzReceive(Origin(40245, FORWARDER, 1), keccak256("fork-sync"), m, address(0), "");
        assertTrue(RECEIVER.isSynced(Currency.unwrap(k.currency1), 93_600));

        (ok, err) = _quoteSell(k, 1e6); // sell one TSLA into the house bid ladder, session UNKNOWN → closed band (WIDEN)
        assertTrue(ok, "a small sell quotes");
        (ok, err) = _quoteSell(k, 100e6); // 100 tokens ≈ $35.7k walks the ladder past −5 %
        assertFalse(ok);
        assertTrue(_contains(err, StockGuardHook.OutOfBand.selector), "the quoter surfaces the guard's OutOfBand");
        assertEq(ITIP20(Currency.unwrap(k.currency1)).totalSupply(), 0, "no mirror exists yet on Moderato");
        assertEq(uint8(ref.currentSession()), uint8(SessionState.UNKNOWN));
    }
}
