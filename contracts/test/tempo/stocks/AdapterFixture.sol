// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {SendParam, MessagingFee} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20Factory} from "tempo-std/interfaces/ITIP20Factory.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {LzTestBase} from "../../shared/LzTestBase.sol";
import {RemoteOFTAlt} from "../../shared/RemoteOFTAlt.sol";
import {LzNetworks} from "../../../script/lib/LzNetworks.sol";
import {TIP20MintBurnAdapter} from "../../../src/stocks/TIP20MintBurnAdapter.sol";

/// Moderato fork: the real TIP-20 factory/TIP-403/pathUSD and the real LZEndpointDollar; LayerZero endpoints come from
/// the devtools helper as EndpointV2Alt instances that take LZD (Tempo has no native value, so both ends pay in LZD).
abstract contract AdapterFixture is LzTestBase {
    using OptionsBuilder for bytes;

    uint256 constant FORK_BLOCK = 37363418;
    uint32 constant TEMPO = 1;
    uint32 constant REMOTE = 2;
    ITIP20 constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);
    ITIP20Factory constant FACTORY = ITIP20Factory(0x20Fc000000000000000000000000000000000000);
    address constant FUNDED = 0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e;

    address safe = makeAddr("safe");
    address guardian = makeAddr("guardian");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    ITIP20 mirror;
    TIP20MintBurnAdapter adapter;
    TIP20MintBurnAdapter impl;
    TransparentUpgradeableProxy proxy;
    RemoteOFTAlt remote;

    function setUp() public virtual override {
        vm.createSelectFork(vm.envOr("MODERATO_RPC_URL", string("https://rpc.moderato.tempo.xyz")), FORK_BLOCK);
        super.setUp();
        address[] memory natives = new address[](2);
        natives[0] = LzNetworks.MODERATO_LZD;
        natives[1] = LzNetworks.MODERATO_LZD;
        createEndpoints(2, LibraryType.UltraLightNode, natives);

        mirror = ITIP20(
            FACTORY.createToken("Bridged TSLA Stock Token (unofficial)", "bTSLA", "TSLA", PATH_USD, address(this), keccak256("fixture"))
        );
        impl = new TIP20MintBurnAdapter(address(mirror), address(endpoints[TEMPO]));
        proxy = new TransparentUpgradeableProxy(
            address(impl), safe, abi.encodeCall(TIP20MintBurnAdapter.initialize, (address(this), guardian))
        );
        adapter = TIP20MintBurnAdapter(address(proxy));
        ITIP20RolesAuth(address(mirror)).grantRole(mirror.ISSUER_ROLE(), address(adapter));
        mirror.setSupplyCap(1_000e6);

        remote = new RemoteOFTAlt(address(endpoints[REMOTE]), address(this));
        address[] memory oapps = new address[](2);
        oapps[0] = address(adapter);
        oapps[1] = address(remote);
        this.wireOApps(oapps);
        adapter.setInboundLimit(500e6, 1 days);
        adapter.setOutboundLimit(REMOTE, 500e6, 1 days);

        vm.startPrank(FUNDED);
        PATH_USD.transfer(alice, 10_000e6);
        PATH_USD.transfer(bob, 10_000e6);
        vm.stopPrank();
        remote.forgeMint(alice, 100e18);
    }

    function _opts(uint128 gas) internal pure returns (bytes memory) {
        return OptionsBuilder.newOptions().addExecutorLzReceiveOption(gas, 0);
    }

    /// Remote → Tempo: alice's remote tokens become mirror tokens for `to` (committed, not executed).
    function _inbound(address to, uint256 amount18, uint128 gas) internal returns (Delivery memory) {
        SendParam memory p = SendParam(TEMPO, _b32(to), amount18, 0, _opts(gas), "", "");
        MessagingFee memory fee = remote.quoteSend(p, false);
        vm.startPrank(alice);
        PATH_USD.approve(address(remote), fee.nativeFee);
        remote.send(p, fee, alice);
        vm.stopPrank();
        return commitNext(TEMPO, address(adapter));
    }

    function _mintTo(address to, uint256 amount18) internal {
        Delivery memory d = _inbound(to, amount18, 1_000_000);
        (bool ok, bytes memory err) = execute(d, d.gas);
        require(ok, string(err));
    }
}
