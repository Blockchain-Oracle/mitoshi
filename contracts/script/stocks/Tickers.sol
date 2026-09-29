// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice The bridged tickers per network (testnet: the RH faucet's five; plan ST-01). Robinhood testnet addresses are
///         hard-coded, never resolved by symbol (the testnet is full of look-alikes; context/tempo/14 §2.2).
library Tickers {
    function testnet() internal pure returns (string[5] memory) {
        return ["TSLA", "AMZN", "PLTR", "NFLX", "AMD"];
    }

    function rhTestnetStock(string memory t) internal pure returns (address) {
        bytes32 h = keccak256(bytes(t));
        if (h == keccak256("TSLA")) return 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
        if (h == keccak256("AMZN")) return 0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02;
        if (h == keccak256("PLTR")) return 0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0;
        if (h == keccak256("NFLX")) return 0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93;
        if (h == keccak256("AMD")) return 0x71178BAc73cBeb415514eB542a8995b82669778d;
        revert("unknown ticker");
    }
}
