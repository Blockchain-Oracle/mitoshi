// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";

interface IStockSyncState {
    function uiMultiplierOf(address mirror) external view returns (uint256);
    function pendingOf(address mirror) external view returns (uint256 pending, uint256 effectiveAt);
    function flagsOf(address mirror) external view returns (uint8);
}

/// @title ScaledUIView — the ERC-8056 face of one mirror TIP-20 (plan B.1.4, ST-05, ST-14).
/// @notice A TIP-20 is a precompile and can't carry ERC-8056 itself, so this companion exposes the mirrored Robinhood
///         multiplier: `uiMultiplier()` (switches to the pending value at `effectiveAt`, like Robinhood's), the pending
///         extension, UI balances (raw × multiplier / 1e18), and the source status flags. It reports exactly the three
///         interface IDs Robinhood supports (not Conversion 0x57854fc3). Events come from `StockSyncReceiver`.
contract ScaledUIView {
    bytes4 internal constant IERC165 = 0x01ffc9a7;
    bytes4 internal constant ISCALED_UI_AMOUNT = 0xa60bf13d;
    bytes4 internal constant INEW_UI_MULTIPLIER = 0x4bd27648;
    bytes4 internal constant IBALANCES = 0xd890fd71;

    address public immutable mirror;
    IStockSyncState public immutable receiver;

    event UIMultiplierUpdated(uint256 oldMultiplier, uint256 newMultiplier, uint256 effectiveAtTimestamp);
    event UIMultiplierUpdateCancelled(uint256 cancelledMultiplier, uint256 cancelledEffectiveAt);

    error OnlyReceiver();

    constructor(address mirror_, address receiver_) {
        mirror = mirror_;
        receiver = IStockSyncState(receiver_);
    }

    function notifyUpdated(uint256 oldMultiplier, uint256 newMultiplier, uint256 at) external {
        if (msg.sender != address(receiver)) revert OnlyReceiver();
        emit UIMultiplierUpdated(oldMultiplier, newMultiplier, at);
    }

    function notifyCancelled(uint256 cancelledMultiplier, uint256 cancelledAt) external {
        if (msg.sender != address(receiver)) revert OnlyReceiver();
        emit UIMultiplierUpdateCancelled(cancelledMultiplier, cancelledAt);
    }

    function uiMultiplier() public view returns (uint256) {
        return receiver.uiMultiplierOf(mirror);
    }

    function newUIMultiplier() external view returns (uint256 pending) {
        (pending,) = receiver.pendingOf(mirror);
    }

    function effectiveAt() external view returns (uint256 at) {
        (, at) = receiver.pendingOf(mirror);
    }

    function balanceOfUI(address account) external view returns (uint256) {
        return (ITIP20(mirror).balanceOf(account) * uiMultiplier()) / 1e18;
    }

    function totalSupplyUI() external view returns (uint256) {
        return (ITIP20(mirror).totalSupply() * uiMultiplier()) / 1e18;
    }

    function flags() external view returns (uint8) {
        return receiver.flagsOf(mirror);
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == IERC165 || id == ISCALED_UI_AMOUNT || id == INEW_UI_MULTIPLIER || id == IBALANCES;
    }
}
