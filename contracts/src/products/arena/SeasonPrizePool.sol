// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/games/SeasonPrizePool.sol (R4-9, D-227) — verbatim: a season's prize escrow
// in the arena's own collateral (pathUSD on Tempo).

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SeasonPrizePool — a season's prize escrow, ported from Flicky's `season::prize_pool`.
/// @notice Anyone may fund it; only the admin may pay it out, once, to a ranked list of winners, or recover
///         what is left. Standings and eligibility live off-chain (the ladder the settler writes); this is
///         only the payout rail, so a season's prize is money that already sits in a contract rather than a
///         promise on a page. The reference escrowed SUI; this escrows the venue's own collateral (pathUSD), the
///         money the duels are played in.
/// @dev Safety properties, the reference's own: funds leave only through `distribute` (admin, single-shot,
///      `sum(amounts) <= balance`, matched lengths, non-empty) or `withdrawRemainder` (admin), so the pool can
///      neither be replayed nor over-spent, and nothing is ever stuck. `endsAtSec` is informational — payout
///      timing is the admin's discretion, not enforced here — exactly as `ends_at_ms` was.
contract SeasonPrizePool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    /// @dev Human label for the season, e.g. "season-1". Informational.
    string public seasonId;
    /// @dev When the season ends, in seconds. Informational, as the reference's was.
    uint64 public immutable endsAtSec;
    address public admin;
    /// @dev Set once `distribute` runs; blocks a second distribution.
    bool public distributed;
    /// @dev Everything ever deposited, so a page can say how the pool was built rather than only what is left.
    uint256 public deposited;

    event PoolCreated(address indexed token, string seasonId, uint64 endsAtSec);
    event Deposited(address indexed from, uint256 amount, uint256 balance);
    event Distributed(uint256 total, uint256 winners);
    event RemainderWithdrawn(address indexed to, uint256 amount);
    event AdminChanged(address indexed admin);

    error NotAdmin(address caller);
    error ZeroAddress();
    error ZeroAmount();
    error MismatchedLengths(uint256 winners, uint256 amounts);
    error ZeroWinners();
    error InsufficientPool(uint256 want, uint256 have);
    error AlreadyDistributed();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin(msg.sender);
        _;
    }

    constructor(IERC20 token_, string memory seasonId_, uint64 endsAtSec_) {
        if (address(token_) == address(0)) revert ZeroAddress();
        token = token_;
        seasonId = seasonId_;
        endsAtSec = endsAtSec_;
        admin = msg.sender;
        emit PoolCreated(address(token_), seasonId_, endsAtSec_);
    }

    /// @notice Top the pool up. Anyone may — funding is always safe.
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        token.safeTransferFrom(msg.sender, address(this), amount);
        deposited += amount;
        emit Deposited(msg.sender, amount, token.balanceOf(address(this)));
    }

    /// @notice Pay each winner their amount, then lock the pool. Admin-only, single-shot. `winners[i]`
    ///         receives `amounts[i]`; a zero amount is skipped. Any leftover stays for `withdrawRemainder`.
    function distribute(address[] calldata winners, uint256[] calldata amounts) external onlyAdmin nonReentrant {
        if (distributed) revert AlreadyDistributed();
        uint256 n = winners.length;
        if (n != amounts.length) revert MismatchedLengths(n, amounts.length);
        if (n == 0) revert ZeroWinners();

        uint256 total;
        for (uint256 i = 0; i < n; i++) {
            if (winners[i] == address(0)) revert ZeroAddress();
            total += amounts[i];
        }
        uint256 have = token.balanceOf(address(this));
        if (total > have) revert InsufficientPool(total, have);

        distributed = true;
        for (uint256 i = 0; i < n; i++) {
            if (amounts[i] != 0) token.safeTransfer(winners[i], amounts[i]);
        }
        emit Distributed(total, n);
    }

    /// @notice Recover what is left — a cancelled season, an over-funded pool, dust after a distribution.
    ///         Admin-only; before or after `distribute`. The safety hatch that means funds are never stuck.
    function withdrawRemainder(address to) external onlyAdmin nonReentrant returns (uint256 amount) {
        if (to == address(0)) revert ZeroAddress();
        amount = token.balanceOf(address(this));
        if (amount != 0) token.safeTransfer(to, amount);
        emit RemainderWithdrawn(to, amount);
    }

    function setAdmin(address next) external onlyAdmin {
        if (next == address(0)) revert ZeroAddress();
        admin = next;
        emit AdminChanged(next);
    }

    /// @notice What the pool holds right now — the headline a page prints beside the split.
    function balance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }
}
