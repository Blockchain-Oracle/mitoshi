// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {DoubleEndedQueue} from "@openzeppelin/contracts/utils/structs/DoubleEndedQueue.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20Factory} from "tempo-std/interfaces/ITIP20Factory.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {LzTestBase} from "../../shared/LzTestBase.sol";
import {LzNetworks} from "../../../script/lib/LzNetworks.sol";
import {MockStockToken} from "../../evm/mocks/MockStockToken.sol";
import {TIP20MintBurnAdapter} from "../../../src/stocks/TIP20MintBurnAdapter.sol";
import {LockboxAlt} from "./LockboxAlt.sol";
import {BridgeHandler, IDeliverer} from "./BridgeHandler.sol";

/// Plan B.6 bridge invariants over the direct path (RH lockbox 1 ⇄ Tempo adapter 2) on a Moderato fork with the real
/// TIP-20 precompiles and LZD. Conservation, in shared-decimal units (1 SD = 1e12 LD):
///   stock.balanceOf(lockbox) == (mirror supply + adapter deferred + in flight both ways) · 1e12 + lockbox owed.
/// afterInvariant (D-054) lifts every refusal, settles and redeems everyone, and requires the lockbox to empty.
/// forge-config: default.invariant.runs = 24
/// forge-config: default.invariant.depth = 24
contract BridgeInvariantTest is LzTestBase, IDeliverer {
    using DoubleEndedQueue for DoubleEndedQueue.Bytes32Deque;

    uint32 constant RH = 1;
    uint32 constant TEMPO = 2;
    address constant FUNDED = 0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e;
    ITIP20 constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);

    BridgeHandler handler;
    MockStockToken stock;
    LockboxAlt box;
    TIP20MintBurnAdapter adapter;
    ITIP20 mirror;

    function setUp() public override {
        vm.createSelectFork(vm.envOr("MODERATO_RPC_URL", string("https://rpc.moderato.tempo.xyz")), 37363418);
        super.setUp();
        address[] memory natives = new address[](2);
        (natives[0], natives[1]) = (LzNetworks.MODERATO_LZD, LzNetworks.MODERATO_LZD);
        createEndpoints(2, LibraryType.UltraLightNode, natives);

        stock = new MockStockToken("TSLA");
        box = new LockboxAlt(address(stock), endpoints[RH], address(this), address(this), 1e12);
        mirror = ITIP20(ITIP20Factory(0x20Fc000000000000000000000000000000000000).createToken(
            "Bridged TSLA Stock Token (unofficial)", "bTSLA", "TSLA", PATH_USD, address(this), keccak256("inv")
        ));
        TIP20MintBurnAdapter impl = new TIP20MintBurnAdapter(address(mirror), endpoints[TEMPO]);
        adapter = TIP20MintBurnAdapter(address(new TransparentUpgradeableProxy(
            address(impl), address(0x5AFE), abi.encodeCall(TIP20MintBurnAdapter.initialize, (address(this), address(this)))
        )));
        ITIP20RolesAuth(address(mirror)).grantRole(mirror.ISSUER_ROLE(), address(adapter));
        address[] memory oapps = new address[](2);
        (oapps[0], oapps[1]) = (address(box), address(adapter));
        this.wireOApps(oapps);
        box.setRateLimits(TEMPO, 1e30, 1 days);
        adapter.setInboundLimit(1e24, 1 days);
        adapter.setOutboundLimit(RH, 1e24, 1 days);

        address[3] memory who = [makeAddr("a0"), makeAddr("a1"), makeAddr("a2")];
        handler = new BridgeHandler(this, stock, box, adapter, mirror, who);
        mirror.setSupplyCap(1_000e6);
        ITIP20RolesAuth r = ITIP20RolesAuth(address(mirror));
        r.grantRole(mirror.PAUSE_ROLE(), address(handler));
        r.grantRole(mirror.UNPAUSE_ROLE(), address(handler));
        r.grantRole(bytes32(0), address(handler));
        vm.startPrank(FUNDED);
        for (uint256 i; i < 3; i++) PATH_USD.transfer(who[i], 20_000e6);
        vm.stopPrank();

        targetContract(address(handler));
        bytes4[] memory sel = new bytes4[](10);
        sel[0] = BridgeHandler.lock.selector;
        sel[1] = BridgeHandler.burn.selector;
        sel[2] = BridgeHandler.deliverToTempo.selector;
        sel[3] = BridgeHandler.deliverToRh.selector;
        sel[4] = BridgeHandler.claimDeferred.selector;
        sel[5] = BridgeHandler.claimOwed.selector;
        sel[6] = BridgeHandler.toggleMirrorPause.selector;
        sel[7] = BridgeHandler.setCap.selector;
        sel[8] = BridgeHandler.blockOnRh.selector;
        sel[9] = BridgeHandler.deliverToTempo.selector;
        targetSelector(FuzzSelector(address(handler), sel));
    }

    // ─── IDeliverer (the executor's role) ────────────────────────────────

    function pending(uint32 dstEid, address dst) external view returns (uint256) {
        return packetsQueue[dstEid][_b32(dst)].length();
    }

    function deliverOne(uint32 dstEid, address dst) external returns (bool ok) {
        Delivery memory d = commitNext(dstEid, dst);
        (ok,) = execute(d, d.gas);
    }

    // ─── invariants ──────────────────────────────────────────────────────

    function invariant_lockedEqualsSupplyPlusInFlight() public view {
        uint256 sd = mirror.totalSupply() + adapter.totalDeferred() + handler.inFlightToTempoSD() + handler.inFlightToRhSD();
        assertEq(stock.balanceOf(address(box)), sd * 1e12 + box.totalOwed());
    }

    function invariant_outstandingBoundsUnlocks() public view {
        uint256 sd = mirror.totalSupply() + adapter.totalDeferred() + handler.inFlightToTempoSD() + handler.inFlightToRhSD();
        assertEq(box.outstanding(TEMPO), sd * 1e12, "every unlock is bounded by what was locked towards Tempo");
        assertEq(box.totalOutstanding(), box.outstanding(TEMPO));
    }

    function invariant_noUnbackedMint() public view {
        assertEq(adapter.mintedNet(), mirror.totalSupply(), "only the adapter issues");
        assertLe(mirror.totalSupply() * 1e12, box.outstanding(TEMPO));
    }

    /// Directed walk through every money path the fuzzer mixes: mint, deferral (paused mirror), claim, burn, owed
    /// (recipient blocked on RH), claim — with the invariants holding after every step.
    function test_handlerExercisesEveryPath() public {
        handler.lock(0, 10e18); // a0 -> a1
        _checkAll();
        handler.toggleMirrorPause(true);
        handler.deliverToTempo();
        assertEq(handler.defersSeen(), 1, "paused mirror defers");
        _checkAll();
        handler.toggleMirrorPause(false);
        handler.claimDeferred(1);
        assertEq(mirror.balanceOf(makeAddr("a1")), 10e6);
        handler.blockOnRh(0, true); // a1 burns towards a0 (who + 2 = 3 -> a0)
        handler.burn(1, 4e6);
        assertEq(handler.burns(), 1);
        handler.deliverToRh();
        assertEq(handler.owedSeen(), 1, "blocked recipient becomes owed");
        _checkAll();
        handler.blockOnRh(0, false);
        handler.claimOwed(0);
        assertEq(stock.balanceOf(makeAddr("a0")), 4e18);
        _checkAll();
        afterInvariant();
    }

    function _checkAll() internal view {
        invariant_lockedEqualsSupplyPlusInFlight();
        invariant_outstandingBoundsUnlocks();
        invariant_noUnbackedMint();
    }

    function afterInvariant() public {
        handler.settleAll();
        assertEq(mirror.totalSupply(), 0, "every mirror redeemed");
        assertEq(adapter.totalDeferred(), 0);
        assertEq(box.totalOwed(), 0);
        assertEq(box.totalOutstanding(), 0);
        assertEq(stock.balanceOf(address(box)), 0, "lockbox empties exactly");
    }
}
