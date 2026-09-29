// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {EndpointV2Mock} from "@layerzerolabs/test-devtools-evm-foundry/contracts/mocks/EndpointV2Mock.sol";
import {Origin} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20Factory} from "tempo-std/interfaces/ITIP20Factory.sol";
import {StockSyncCodec as C} from "../../../src/common/StockSyncCodec.sol";
import {StockSyncReceiver} from "../../../src/stocks/StockSyncReceiver.sol";
import {ScaledUIView} from "../../../src/stocks/ScaledUIView.sol";

/// Local Tempo VM (real TIP-20 precompiles). The receiver's endpoint is the devtools EndpointV2 (only its address and
/// `setDelegate` matter); deliveries are made as the endpoint calling `lzReceive`, as the real executor path does.
abstract contract SyncFixture is Test {
    uint32 constant FORWARDER_EID = 40245;
    uint32 constant RH_TESTNET_CHAIN = 46630;
    bytes32 constant PEER = bytes32(uint256(0xF0F0));
    address constant CRWD_RH = 0xea72Ecca2d0f6bFA1394DBBCff85b52CD4233931;

    EndpointV2Mock endpoint;
    StockSyncReceiver receiver;
    ITIP20 mirror;
    ScaledUIView uiView;
    uint64 nonce;

    function setUp() public virtual {
        endpoint = new EndpointV2Mock(40444, address(this));
        receiver = new StockSyncReceiver(address(endpoint), address(this), RH_TESTNET_CHAIN);
        receiver.setPeer(FORWARDER_EID, PEER);
        mirror = ITIP20(
            ITIP20Factory(0x20Fc000000000000000000000000000000000000).createToken(
                "Bridged CRWD Stock Token (unofficial)", "bCRWD", "CRWD",
                ITIP20(0x20C0000000000000000000000000000000000000), address(this), keccak256("crwd")
            )
        );
        uiView = new ScaledUIView(address(mirror), address(receiver));
        receiver.bindToken(CRWD_RH, address(mirror), uiView);
        vm.warp(1_782_950_000);
    }

    function _msg(uint32 chain, uint64 ts, uint64 seq, uint128 cur, uint128 pend, uint64 at, uint8 flags)
        internal
        pure
        returns (bytes memory)
    {
        return bytes.concat(
            C.encodeHeader(C.Header(chain, ts, seq, 2)),
            C.encodeMultiplier(C.Multiplier(CRWD_RH, cur, pend, at)),
            C.encodeStatus(C.Status(CRWD_RH, flags))
        );
    }

    function _deliver(bytes memory m) internal returns (uint256 gasUsed) {
        bytes32 guid = keccak256(abi.encode(++nonce));
        vm.prank(address(endpoint));
        uint256 g = gasleft();
        receiver.lzReceive(Origin(FORWARDER_EID, PEER, nonce), guid, m, address(0), "");
        gasUsed = g - gasleft();
    }
}
