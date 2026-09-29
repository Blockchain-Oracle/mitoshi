// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";

/// @title The receive-policy pre-check every product payout makes (P12, D-014).
/// @notice A TIP-1028 receive policy does not make a TIP-20 transfer revert: a blocked inbound "succeeds" into the
///         ReceivePolicyGuard (F-S2-09). So a product asks `TIP403Registry.validateReceivePolicy` first. On a call the
///         receiver makes for themself (a withdraw) the product refuses (`ReceivePolicyBlocked`) and keeps the funds
///         where they were; on a payout someone else triggers, `Payouts._payOrOwe` holds it as owed instead.
library PayoutCheck {
    using SafeERC20 for IERC20;

    error ReceivePolicyBlocked(address to);

    /// @notice Whether `to` would receive `token` from this contract (true for any account with no policy).
    function receivable(IERC20 token, address to) internal view returns (bool ok) {
        (ok,) = StdPrecompiles.TIP403_REGISTRY.validateReceivePolicy(address(token), address(this), to);
    }

    /// @notice Pays `to` or refuses the whole call (`ReceivePolicyBlocked`).
    function payChecked(IERC20 token, address to, uint256 amount) internal {
        if (!receivable(token, to)) revert ReceivePolicyBlocked(to);
        token.safeTransfer(to, amount);
    }
}

/// @title Pay-or-owe for payouts a third party triggers (D-014; the D-114 pattern of Agari's reserves).
/// @notice `_payOrOwe` pre-checks the receive policy and, when the receiver would not get the money (a blocking
///         policy, or a TIP-403 token policy that reverts the transfer), books it as `owedOf[to]` and emits
///         `PayoutHeld`. The receiver collects it later with `claimOwed()`, which pays `msg.sender` only (AD-5).
abstract contract Payouts {
    using SafeERC20 for IERC20;

    /// @notice What each account is owed after a held payout.
    mapping(address account => uint256 amount) public owedOf;
    /// @notice Σ `owedOf` — part of the product's liabilities.
    uint256 public totalOwedPayouts;

    event PayoutHeld(address indexed to, uint256 amount, uint256 owed);
    event OwedClaimed(address indexed to, uint256 amount);

    error NothingOwed();

    /// @dev The token every payout is made in.
    function _payoutToken() internal view virtual returns (IERC20);

    /// @notice Collects everything the caller is owed. Refuses while the caller's receive policy still blocks it.
    function claimOwed() external returns (uint256 amount) {
        amount = owedOf[msg.sender];
        if (amount == 0) revert NothingOwed();
        owedOf[msg.sender] = 0;
        totalOwedPayouts -= amount;
        PayoutCheck.payChecked(_payoutToken(), msg.sender, amount);
        emit OwedClaimed(msg.sender, amount);
    }

    /// @return paid true when `amount` reached `to`; false when it was booked as owed instead
    function _payOrOwe(address to, uint256 amount) internal returns (bool paid) {
        if (amount == 0) return true;
        IERC20 token = _payoutToken();
        if (PayoutCheck.receivable(token, to) && token.trySafeTransfer(to, amount)) return true;
        uint256 owed = owedOf[to] + amount;
        owedOf[to] = owed;
        totalOwedPayouts += amount;
        emit PayoutHeld(to, amount, owed);
        return false;
    }
}
