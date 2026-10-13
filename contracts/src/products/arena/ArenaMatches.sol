// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/games/ArenaMatches.sol (R4-9, D-227) — the ledger verbatim; only the
// constructor follows the seam (engine + lens instead of the DreamDEX module, ERC-6909 and venue pin).

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IEventsEngine} from "../../engine/interfaces/IEventsEngine.sol";
import {IEngineLens} from "../../engine/interfaces/IEngineLens.sol";
import {ArenaGateway} from "./ArenaGateway.sol";

/// @title The arena's ledger — every match, deck, pick and credit, and the ways a pot goes home.
/// @notice Split out of `GameArena` when the agent lane arrived (2026-09-04): the contract had reached the
///         400-line rule, and the seam was already there — this half only ever records and refunds, the
///         other half trades. Nothing here prices anything.
/// @dev Credits pay the player, never the caller (AD-5). Storage and events carry market ids only (AD-10).
abstract contract ArenaMatches is ArenaGateway, ReentrancyGuard {
    using SafeERC20 for IERC20;

    mapping(bytes32 matchId => Match) internal _matches;
    mapping(bytes32 matchId => bytes32[]) internal _cards;
    /// @dev Keyed by `cardIndex * 2 + seat`, so one card's two picks sit beside each other.
    mapping(bytes32 matchId => mapping(uint16 slot => PickRecord)) internal _picks;
    mapping(bytes32 matchId => int256[2] bySeat) internal _pnl;

    mapping(address player => uint256) public creditOf;
    /// @dev Pots held for undecided matches, and credits owed but unclaimed. The arena's collateral
    ///      balance is at least their sum after every call; the rest is dust the venue refunded.
    uint256 public escrowed;
    uint256 public credited;

    constructor(IERC20 collateral_, IEventsEngine engine_, IEngineLens lens_, Params memory params_)
        ArenaGateway(collateral_, engine_, lens_, params_)
    {}

    // ------------------------------------------------------------------ the ways out

    /// @notice The creator withdraws a match nobody has joined.
    function cancelMatch(bytes32 matchId) external nonReentrant {
        Match storage m = _get(matchId);
        if (m.status != Status.WAITING) revert WrongStatus(matchId, m.status);
        if (msg.sender != m.creator) revert NotAPlayer(msg.sender);
        _refundCreator(matchId, m, RefundReason.CREATOR_CANCELLED);
    }

    /// @notice Anyone may return an unjoined pot once the join window has closed.
    function refundUnjoined(bytes32 matchId) external nonReentrant {
        Match storage m = _get(matchId);
        if (m.status != Status.WAITING) revert WrongStatus(matchId, m.status);
        uint64 deadline = m.createdAtSec + params.joinWindowSec;
        if (block.timestamp <= deadline) revert DeadlineNotPassed(deadline);
        _refundCreator(matchId, m, RefundReason.JOIN_TIMEOUT);
    }

    /// @notice Anyone may return both pots when the deck was never opened. Losing the reveal material is
    ///         an operator failure, so it refunds rather than punishing a player.
    function refundUnrevealed(bytes32 matchId) external nonReentrant {
        Match storage m = _get(matchId);
        if (m.status != Status.ACTIVE_UNREVEALED) revert WrongStatus(matchId, m.status);
        uint64 deadline = m.joinedAtSec + params.revealWindowSec;
        if (block.timestamp <= deadline) revert DeadlineNotPassed(deadline);
        _refundBoth(matchId, m, RefundReason.REVEAL_UNAVAILABLE);
    }

    /// @notice Takes a player's credits — pot and payouts alike. Pays the player, never the caller, so a
    ///         relayer or a friend can crank it without becoming the beneficiary.
    function claimCredit(address player) external nonReentrant returns (uint256 amount) {
        amount = creditOf[player];
        if (amount == 0) revert NoCredit(player);
        creditOf[player] = 0;
        credited -= amount;
        collateral.safeTransfer(player, amount);
        emit CreditClaimed(player, amount, msg.sender);
    }

    // ------------------------------------------------------------------ views

    function matchOf(bytes32 matchId) external view returns (Match memory) {
        return _matches[matchId];
    }

    function deckOf(bytes32 matchId) external view returns (bytes32[] memory) {
        return _cards[matchId];
    }

    function pickOf(bytes32 matchId, uint8 cardIndex, uint8 seat) external view returns (PickRecord memory) {
        return _picks[matchId][_slot(cardIndex, seat)];
    }

    /// @dev `payout - cost` summed over settled cards, per seat. Negative until a card pays.
    function pnlOf(bytes32 matchId) external view returns (int256 creatorPnl, int256 challengerPnl) {
        return (_pnl[matchId][0], _pnl[matchId][1]);
    }

    // ------------------------------------------------------------------ internals

    function _get(bytes32 matchId) internal view returns (Match storage m) {
        m = _matches[matchId];
        if (m.creator == address(0)) revert NoSuchMatch(matchId);
    }

    function _seatOf(Match storage m, address who) internal view returns (uint8) {
        if (who == m.creator) return 0;
        if (who == m.challenger) return 1;
        revert NotAPlayer(who);
    }

    function _slot(uint8 cardIndex, uint8 seat) internal pure returns (uint16) {
        return uint16(cardIndex) * 2 + seat;
    }

    function _fullMask(uint8 deckSize) internal pure returns (uint8) {
        return uint8((uint16(1) << deckSize) - 1);
    }

    function _refundCreator(bytes32 matchId, Match storage m, RefundReason reason) internal {
        uint256 per = m.potBase;
        m.status = Status.REFUNDED;
        if (per != 0) {
            escrowed -= per;
            credited += per;
            creditOf[m.creator] += per;
        }
        emit MatchRefunded(matchId, reason, per);
    }

    function _refundBoth(bytes32 matchId, Match storage m, RefundReason reason) internal {
        uint256 per = m.potBase;
        m.status = Status.REFUNDED;
        if (per != 0) {
            escrowed -= per * 2;
            credited += per * 2;
            creditOf[m.creator] += per;
            creditOf[m.challenger] += per;
        }
        emit MatchRefunded(matchId, reason, per);
    }
}
