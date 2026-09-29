// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm} from "forge-std/Vm.sol";
import {DoubleEndedQueue} from "@openzeppelin/contracts/utils/structs/DoubleEndedQueue.sol";
import {ILayerZeroEndpointV2} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {EnforcedOptionParam} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppOptionsType3.sol";
import {LzTestBase} from "../../shared/LzTestBase.sol";
import {RemoteOFT} from "../helpers/RemoteOFT.sol";
import {MockStockToken} from "../mocks/MockStockToken.sol";
import {StockLockbox} from "../../../src/robinhood/StockLockbox.sol";
import {TransitOFT} from "../../../src/transit/TransitOFT.sol";
import {HopComposer} from "../../../src/transit/HopComposer.sol";
import {HopHandler, IHopMesh} from "./HopHandler.sol";

/// Plan B.6 `BridgeHopInvariant`: the testnet mesh through a Base-like transit keeps
///   lockbox balance == outstanding + owed,  and  outstanding == final supply + transit supply + in flight,
/// where transit supply can only sit at the composer (between lzReceive and lzCompose). afterInvariant redeems all.
/// forge-config: default.invariant.runs = 48
/// forge-config: default.invariant.depth = 30
contract BridgeHopInvariantTest is LzTestBase, IHopMesh {
    using DoubleEndedQueue for DoubleEndedQueue.Bytes32Deque;
    using OptionsBuilder for bytes;

    uint32 constant RH = 1;
    uint32 constant BASE = 2;
    uint32 constant FINAL = 3;
    bytes32 constant COMPOSE_SENT = keccak256("ComposeSent(address,address,bytes32,uint16,bytes)");

    MockStockToken stock;
    StockLockbox box;
    TransitOFT transit;
    HopComposer composer;
    RemoteOFT remote;
    HopHandler handler;

    struct Compose {
        bytes32 guid;
        bytes message;
    }

    Compose[] internal _composes;
    uint256 internal _nextCompose;
    /// Amounts (LD) sent from either end and not yet credited on Base or at the final end.
    uint256 public inFlightLD;

    function setUp() public override {
        super.setUp();
        setUpEndpoints(3, LibraryType.UltraLightNode);
        stock = new MockStockToken("TSLA");
        box = new StockLockbox(address(stock), endpoints[RH], address(this), address(this), 1e12);
        transit = new TransitOFT("Transit TSLA", "tTSLA", endpoints[BASE], address(this));
        remote = new RemoteOFT(endpoints[FINAL], address(this));
        composer = new HopComposer(endpoints[BASE], address(transit), RH, FINAL, 1e12, address(this));
        box.setPeer(BASE, _b32(address(transit)));
        transit.setPeer(RH, _b32(address(box)));
        transit.setPeer(FINAL, _b32(address(remote)));
        remote.setPeer(BASE, _b32(address(transit)));
        box.setRateLimits(BASE, type(uint128).max, 1 days);
        EnforcedOptionParam[] memory e = new EnforcedOptionParam[](2);
        e[0] = EnforcedOptionParam(FINAL, 1, OptionsBuilder.newOptions().addExecutorLzReceiveOption(300_000, 0));
        e[1] = EnforcedOptionParam(RH, 1, OptionsBuilder.newOptions().addExecutorLzReceiveOption(300_000, 0));
        transit.setEnforcedOptions(e);
        vm.deal(address(composer), 1_000 ether);
        address[3] memory who = [makeAddr("h0"), makeAddr("h1"), makeAddr("h2")];
        handler = new HopHandler(this, stock, box, transit, remote, address(composer), who);
        targetContract(address(handler));
        excludeSelector(FuzzSelector(address(handler), _one(HopHandler.settleAll.selector)));
    }

    function _one(bytes4 s) internal pure returns (bytes4[] memory a) {
        a = new bytes4[](1);
        a[0] = s;
    }

    // ─── the mesh (executor role) ────────────────────────────────────────

    function pending(uint32 dstEid, address dst) external view returns (uint256) {
        return packetsQueue[dstEid][_b32(dst)].length();
    }

    function pendingComposes() external view returns (uint256) {
        return _composes.length - _nextCompose;
    }

    function deliverOne(uint32 dstEid, address dst) external returns (bool ok) {
        Delivery memory d = commitNext(dstEid, dst);
        vm.recordLogs();
        (ok,) = execute(d, d.gas);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].topics[0] == COMPOSE_SENT) {
                (,, bytes32 guid,, bytes memory m) = abi.decode(logs[i].data, (address, address, bytes32, uint16, bytes));
                _composes.push(Compose(guid, m));
            }
        }
    }

    function composeOne() external returns (bool ok) {
        Compose memory c = _composes[_nextCompose];
        try ILayerZeroEndpointV2(endpoints[BASE]).lzCompose{gas: 1_500_000}(address(transit), address(composer), c.guid, 0, c.message, "") {
            ok = true;
            _nextCompose++; // a failed compose stays first in line (it stays stored at the endpoint too)
        } catch {}
    }

    // ─── invariants ──────────────────────────────────────────────────────

    function _inFlight() internal view returns (uint256) {
        // everything the lockbox let out minus what sits somewhere observable
        return box.outstanding(BASE) - remote.totalSupply() - transit.totalSupply();
    }

    function invariant_lockboxHoldsOutstandingPlusOwed() public view {
        assertEq(stock.balanceOf(address(box)), box.totalOutstanding() + box.totalOwed());
    }

    function invariant_transitOnlyAtComposer() public view {
        assertEq(transit.totalSupply(), transit.balanceOf(address(composer)), "transit supply exists only mid-hop");
    }

    function invariant_noUnbackedMint() public view {
        assertLe(remote.totalSupply() + transit.totalSupply(), box.outstanding(BASE), "never more mirrors than locked");
    }

    function invariant_inFlightMatchesQueues() public view {
        // with nothing queued anywhere, nothing may be unaccounted for
        bool idle = this.pending(BASE, address(transit)) == 0 && this.pendingComposes() == 0
            && this.pending(FINAL, address(remote)) == 0 && this.pending(RH, address(box)) == 0;
        if (idle) assertEq(_inFlight(), 0, string.concat("composes ", vm.toString(_composes.length), "/", vm.toString(_nextCompose)));
    }

    function afterInvariant() public {
        handler.settleAll();
        assertEq(remote.totalSupply(), 0);
        assertEq(transit.totalSupply(), 0);
        assertEq(box.totalOwed(), 0);
        assertEq(stock.balanceOf(address(box)), 0, "every hop redeemed; the lockbox empties exactly");
    }
}
