// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {console} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {Origin} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {SendParam, MessagingFee} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ForkHelpers} from "../../shared/ForkHelpers.sol";
import {LzNetworks} from "../../../script/lib/LzNetworks.sol";
import {StockLockbox} from "../../../src/robinhood/StockLockbox.sol";
import {StockSyncSender} from "../../../src/robinhood/StockSyncSender.sol";
import {StockSyncCodec as C} from "../../../src/common/StockSyncCodec.sol";
import {SyncFlags} from "../../../src/common/BridgeTypes.sol";

/// 14c.12 RH testnet fork: the real faucet TSLA Stock Token and the real EndpointV2 (40451). Lock quotes and emits a
/// packet through the live send library; an unlock delivered as the endpoint returns real TSLA.
contract RhTestnetLockboxForkTest is ForkHelpers {
    using OptionsBuilder for bytes;

    IERC20 constant TSLA = IERC20(0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E);
    address constant HOLDER = 0xFfEf1147c3724a19AB7328F4e361C049ba452dA9; // top TSLA holder on 46630
    address constant TRANSIT_STANDIN = address(0x7A11);
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    StockLockbox box;

    function setUp() public {
        vm.createSelectFork(vm.envOr("RH_TESTNET_RPC_HTTP_URL", string("https://rpc.testnet.chain.robinhood.com")), 126032539);
        box = new StockLockbox(address(TSLA), LzNetworks.RH_TESTNET_ENDPOINT, address(this), address(this), 1e12);
        box.setPeer(LzNetworks.BASE_SEPOLIA_EID, _b32(TRANSIT_STANDIN));
        box.setRateLimits(LzNetworks.BASE_SEPOLIA_EID, 1_000e18, 1 days);
        vm.prank(HOLDER);
        TSLA.transfer(alice, 10e18);
    }

    function test_lockThroughTheLiveEndpoint() public {
        SendParam memory p = SendParam(LzNetworks.BASE_SEPOLIA_EID, _b32(bob), 5e18 + 7, 0,
            OptionsBuilder.newOptions().addExecutorLzReceiveOption(150_000, 0), "", "");
        MessagingFee memory fee = box.quoteSend(p, false);
        console.log("RH testnet -> Base Sepolia lock fee (wei)", fee.nativeFee);
        assertGt(fee.nativeFee, 0);
        vm.deal(alice, fee.nativeFee);
        vm.startPrank(alice);
        TSLA.approve(address(box), 5e18 + 7);
        vm.recordLogs();
        box.send{value: fee.nativeFee}(p, fee, alice);
        vm.stopPrank();
        assertEq(_packetsSent(vm.getRecordedLogs(), LzNetworks.RH_TESTNET_ENDPOINT), 1, "packet emitted by the live endpoint");
        assertEq(TSLA.balanceOf(address(box)), 5e18);
        assertEq(TSLA.balanceOf(alice), 5e18, "the 7 wei of dust never left");
    }

    function test_unlockReturnsRealTsla() public {
        test_lockThroughTheLiveEndpoint();
        bytes memory message = abi.encodePacked(_b32(bob), uint64(4e6));
        vm.prank(LzNetworks.RH_TESTNET_ENDPOINT);
        uint256 g = gasleft();
        box.lzReceive(Origin(LzNetworks.BASE_SEPOLIA_EID, _b32(TRANSIT_STANDIN), 1), keccak256("g"), message, address(this), "");
        console.log("RH testnet unlock gas (OApp)", g - gasleft());
        assertEq(TSLA.balanceOf(bob), 4e18);
        assertEq(box.outstanding(LzNetworks.BASE_SEPOLIA_EID), 1e18);
    }

    function test_syncSenderReadsTheTestnetStock() public {
        StockSyncSender sender = new StockSyncSender(LzNetworks.RH_TESTNET_ENDPOINT, address(this));
        sender.registerToken(address(TSLA), address(box));
        (C.Multiplier memory m, C.Status memory s) = sender.readState(address(TSLA));
        assertEq(m.current, 1e18);
        assertEq(m.pending, 1e18);
        assertEq(s.flags, SyncFlags.TOKEN_PAUSED_SUPPORTED, "testnet: oraclePaused() reverts empty (F-G), not paused");
    }
}
