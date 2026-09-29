// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice LayerZero V2 deployments the bridge uses (plan B.1.5; context/tempo/14-bridging-stock-tokens.md §5.1;
///         dead DVNs from metadata.layerzero-api.com/v1/metadata/deployments, read 2026-09-29). Mirrors
///         `packages/clients/src/pinned.ts` LAYERZERO; change both together.
library LzNetworks {
    struct Net {
        uint32 eid;
        uint256 chainId;
        address endpoint;
        address sendLib;
        address receiveLib;
        address executor;
        address[] dvns; // sorted ascending
        uint64 confirmations;
        address deadDvn;
    }

    uint32 internal constant RH_MAINNET_EID = 30416;
    uint32 internal constant TEMPO_EID = 30410;
    uint32 internal constant RH_TESTNET_EID = 40451;
    uint32 internal constant BASE_SEPOLIA_EID = 40245;
    uint32 internal constant MODERATO_EID = 40444;

    uint256 internal constant RH_MAINNET_CHAIN = 4663;
    uint256 internal constant TEMPO_CHAIN = 4217;
    uint256 internal constant RH_TESTNET_CHAIN = 46630;
    uint256 internal constant BASE_SEPOLIA_CHAIN = 84532;
    uint256 internal constant MODERATO_CHAIN = 42431;

    address internal constant MODERATO_ENDPOINT = 0xFB34352bA2e2D9cB93837bb19D36db5d93BcFC41;
    address internal constant MODERATO_LZD = 0x0e81579B25C9c458A2030824B7fdBd0194900803;
    address internal constant TEMPO_LZD = 0x0cEb237E109eE22374a567c6b09F373C73FA4cBb;
    address internal constant RH_TESTNET_ENDPOINT = 0x3aCAAf60502791D199a5a5F0B173D78229eBFe32;
    address internal constant BASE_SEPOLIA_ENDPOINT = 0x6EDCE65403992e310A62460808c4b910D972f10f;
    address internal constant RH_MAINNET_ENDPOINT = 0x6F475642a6e85809B1c36Fa62763669b1b48DD5B;
    address internal constant TEMPO_ENDPOINT = 0x20Bb7C2E2f4e5ca2B4c57060d1aE2615245dCc9C;

    error UnknownEid(uint32 eid);
    error UnknownChain(uint256 chainId);

    function byEid(uint32 eid) internal pure returns (Net memory n) {
        if (eid == RH_MAINNET_EID) {
            n = Net(eid, RH_MAINNET_CHAIN, RH_MAINNET_ENDPOINT, 0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7,
                0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043, 0x4208D6E27538189bB48E603D6123A94b8Abe0A0b, new address[](2),
                20, 0x6788f52439ACA6BFF597d3eeC2DC9a44B8FEE842);
            n.dvns[0] = 0x0Ffe02DF012299A370D5dd69298A5826EAcaFdF8; // Nethermind
            n.dvns[1] = 0xd01ae6905d48315f7bE10C7330aeCF8360Ef5b12; // LayerZero Labs
        } else if (eid == TEMPO_EID) {
            n = Net(eid, TEMPO_CHAIN, TEMPO_ENDPOINT, 0x572863d9247E52026E0892d9Cd2E519B41EdB73C,
                0x0B6F08C2D39421Acb49c99abCe82050e356171e5, 0xf851abCa1d0fD1Df8eAba6de466a102996b7d7B2, new address[](2),
                5, 0x3436d350103a9dfA252a04f102f9f10f58Ff450C);
            n.dvns[0] = 0x0D875bD6c833cEDef7Fca4FE154d023cDB8eb1cb; // Nethermind
            n.dvns[1] = 0x76FaFF60799021B301B45dC1BbEDE53F261F9961; // LayerZero Labs
        } else if (eid == RH_TESTNET_EID) {
            n = Net(eid, RH_TESTNET_CHAIN, RH_TESTNET_ENDPOINT, 0x45841dd1ca50265Da7614fC43A361e526c0e6160,
                0xd682ECF100f6F4284138AA925348633B0611Ae21, 0x701f3927871EfcEa1235dB722f9E608aE120d243, new address[](1),
                1, 0x88B27057A9e00c5F05DDa29241027afF63f9e6e0);
            n.dvns[0] = 0xa78A78a13074eD93aD447a26Ec57121f29E8feC2;
        } else if (eid == BASE_SEPOLIA_EID) {
            n = Net(eid, BASE_SEPOLIA_CHAIN, BASE_SEPOLIA_ENDPOINT, 0xC1868e054425D378095A003EcbA3823a5D0135C9,
                0x12523de19dc41c91F7d2093E0CFbB76b17012C8d, 0x8A3D588D9f6AC041476b094f97FF94ec30169d3D, new address[](1),
                1, 0x78551ADC2553EF1858a558F5300F7018Aad2FA7e);
            n.dvns[0] = 0xe1a12515F9AB2764b887bF60B923Ca494EBbB2d6;
        } else if (eid == MODERATO_EID) {
            n = Net(eid, MODERATO_CHAIN, MODERATO_ENDPOINT, 0x91ec94dd5E949BdB2ecE3b91B9602EC5F7F59FFD,
                0xfeBE4c839EFA9f506C092a32fD0BB546B76A1d38, 0xE665f5dFD91DFe883D36Cc8552D4Cc385aC23687, new address[](1),
                1, 0x236B9303d513dDF3f4c4E93A640fB80A178872f1);
            n.dvns[0] = 0x0ac2924460A5b285fd205DeDB46738Ad46971061;
        } else {
            revert UnknownEid(eid);
        }
    }

    function byChain(uint256 chainId) internal pure returns (Net memory) {
        if (chainId == RH_MAINNET_CHAIN) return byEid(RH_MAINNET_EID);
        if (chainId == TEMPO_CHAIN) return byEid(TEMPO_EID);
        if (chainId == RH_TESTNET_CHAIN) return byEid(RH_TESTNET_EID);
        if (chainId == BASE_SEPOLIA_CHAIN) return byEid(BASE_SEPOLIA_EID);
        if (chainId == MODERATO_CHAIN) return byEid(MODERATO_EID);
        revert UnknownChain(chainId);
    }

    /// @notice Every dead DVN we know; `CheckLzConfig` fails if any of them sits in a live config.
    function deadDvns() internal pure returns (address[5] memory d) {
        d = [
            0x6788f52439ACA6BFF597d3eeC2DC9a44B8FEE842,
            0x3436d350103a9dfA252a04f102f9f10f58Ff450C,
            0x88B27057A9e00c5F05DDa29241027afF63f9e6e0,
            0x236B9303d513dDF3f4c4E93A640fB80A178872f1,
            0x78551ADC2553EF1858a558F5300F7018Aad2FA7e
        ];
    }
}
