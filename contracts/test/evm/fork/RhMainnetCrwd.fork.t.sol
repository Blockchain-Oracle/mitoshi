// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {console} from "forge-std/Test.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {EnforcedOptionParam} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppOptionsType3.sol";
import {ForkHelpers} from "../../shared/ForkHelpers.sol";
import {LzNetworks} from "../../../script/lib/LzNetworks.sol";
import {LzWiring} from "../../../script/lib/LzWiring.sol";
import {StockSyncSender} from "../../../src/robinhood/StockSyncSender.sol";
import {StockSyncCodec as C} from "../../../src/common/StockSyncCodec.sol";
import {SyncFlags} from "../../../src/common/BridgeTypes.sol";

contract MainnetWiring is LzWiring {
    function ensure(LzNetworks.Net memory l, LzNetworks.Net memory r, Link memory k) external {
        ensureLink(l, r, k);
    }

    function check(LzNetworks.Net memory l, LzNetworks.Net memory r, Link memory k) external view returns (uint256) {
        return checkLink(l, r, k);
    }
}

/// 14c.12 RH **mainnet** fork (read-only; nothing broadcast): the sender reads CRWD's live 4-for-1 multiplier
/// (effectiveAt 1782999000) and oracle flag, the mainnet B.1.5 row (Nethermind + LZ Labs, 20 confirmations) applies to the
/// real Uln302 libraries, CheckLzConfig's logic passes on it and rejects the dead-DVN default, and the real fee to Tempo
/// (30410) is quoted.
contract RhMainnetCrwdForkTest is ForkHelpers {
    using OptionsBuilder for bytes;

    address constant CRWD = 0xea72Ecca2d0f6bFA1394DBBCff85b52CD4233931;
    StockSyncSender sender;
    MainnetWiring wiring;

    function setUp() public {
        vm.createSelectFork(vm.envOr("RH_RPC_HTTP_URL", string("https://rpc.mainnet.chain.robinhood.com")), 75410370);
        wiring = new MainnetWiring();
        sender = new StockSyncSender(LzNetworks.RH_MAINNET_ENDPOINT, address(wiring));
        vm.prank(address(wiring));
        sender.registerToken(CRWD, address(0xB0C5));
    }

    function test_readsCrwdSplit() public view {
        (C.Multiplier memory m, C.Status memory s) = sender.readState(CRWD);
        assertEq(m.current, 4e18);
        assertEq(m.pending, 4e18);
        assertEq(m.effectiveAt, 1782999000);
        assertEq(s.flags & SyncFlags.ORACLE_SUPPORTED, SyncFlags.ORACLE_SUPPORTED, "mainnet Stock has OraclePausable");
        assertEq(s.flags & SyncFlags.TOKEN_PAUSED_SUPPORTED, SyncFlags.TOKEN_PAUSED_SUPPORTED);
        assertFalse(SyncFlags.isPaused(s.flags));
    }

    function test_mainnetRowAppliesAndQuotes() public {
        LzNetworks.Net memory rh = LzNetworks.byEid(LzNetworks.RH_MAINNET_EID);
        LzNetworks.Net memory tempo = LzNetworks.byEid(LzNetworks.TEMPO_EID);
        LzWiring.Link memory l;
        l.label = "StockSyncSender";
        l.oapp = address(sender);
        l.remoteEid = LzNetworks.TEMPO_EID;
        l.remotePeer = address(0x7E3F0);
        l.sends = true;
        l.options = new EnforcedOptionParam[](1);
        l.options[0] = EnforcedOptionParam(LzNetworks.TEMPO_EID, 1, OptionsBuilder.newOptions().addExecutorLzReceiveOption(150_000, 0));
        assertGt(wiring.check(rh, tempo, l), 0, "the default (dead DVN, unpinned) fails the check");
        wiring.ensure(rh, tempo, l);
        assertEq(wiring.check(rh, tempo, l), 0, "B.1.5 mainnet row applied to the real libraries");
        address[] memory a = new address[](1);
        a[0] = CRWD;
        MessagingFee memory fee = sender.quoteSync(a, LzNetworks.TEMPO_EID);
        console.log("RH mainnet -> Tempo sync fee, 1 token (wei)", fee.nativeFee);
        assertGt(fee.nativeFee, 0);
    }
}
