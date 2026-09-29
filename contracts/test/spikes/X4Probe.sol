// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAccountKeychain} from "tempo-std/interfaces/IAccountKeychain.sol";

/// Spike X4 (S16c.1) probe, deployed on Moderato: stands in for the ThemeRouter. `check` reads the caller's key the
/// way `ThemeRouter.follow` will (getKey + getAllowedCalls) so a batch `[authorize, check]` proves whether a key
/// authorized earlier in the same tx is visible; `rebalance` is the router selector the key is scoped to.
contract X4Probe {
    IAccountKeychain internal constant KEYCHAIN = IAccountKeychain(0xaAAAaaAA00000000000000000000000000000000);

    event Seen(address indexed account, address indexed keyId, uint64 expiry, bool enforceLimits, bool isScoped, uint256 scopes, address txKey);
    event Rebalanced(address indexed account, address txKey);

    error KeyNotVisible();

    struct Trade {
        address tokenIn;
        address tokenOut;
        uint128 amountIn;
        uint128 minAmountOut;
    }

    function check(address keyId) external {
        IAccountKeychain.KeyInfo memory k = KEYCHAIN.getKey(msg.sender, keyId);
        if (k.keyId == address(0) || k.isRevoked) revert KeyNotVisible();
        (bool isScoped, IAccountKeychain.CallScope[] memory scopes) = KEYCHAIN.getAllowedCalls(msg.sender, keyId);
        emit Seen(msg.sender, keyId, k.expiry, k.enforceLimits, isScoped, scopes.length, KEYCHAIN.getTransactionKey());
    }

    function rebalance(uint64, Trade[] calldata, bytes calldata, bytes32) external {
        emit Rebalanced(msg.sender, KEYCHAIN.getTransactionKey());
    }
}
