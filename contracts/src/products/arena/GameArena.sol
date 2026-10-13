// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/games/GameArena.sol (R4-9, D-227). Seam edits: `_resolve` reads the lens
// by market id (the engine's own markets — no venue pin); the card life at reveal counts to `lockAt` (T08); a pick is
// `_buyIoc` through `EngineSeam.placeMeasured` and a card's settlement `_redeem` through `redeemPartialMeasured` of
// exactly its lots (no pool credit to collect: the IOC withdraws its proceeds); `_isSettled` is the lens's resolved
// or voided; the WithAgent entries are not payable (Tempo has no native value).

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IEventsEngine} from "../../engine/interfaces/IEventsEngine.sol";
import {IEngineLens, MarketRef} from "../../engine/interfaces/IEngineLens.sol";
import {ArenaCommitment} from "./ArenaCommitment.sol";
import {ArenaAgents} from "./ArenaAgents.sol";

/// @title GameArena — a two-player duel over real Mitoshi Windows: each card is one confirmed IOC pick,
///        and only the side-pot is the arena's to award.
/// @notice Ported from Flicky's `duel` module (`reference/flicky/apps/contracts/sources/duel.move:123-220`)
///         with one deliberate difference. Flicky settles from keeper-fed prices because its venue has no
///         public settlement read; Masayume redeems each pick through DreamDEX's own module and books the
///         payout the engine paid, so no oracle key sits between a player and their money.
/// @dev The economic spine: a pick's cost and quantity are deltas measured around the IOC, a card's payout
///      is the delta measured around the redemption, and the winner is the greater sum of `payout - cost`.
///      Nothing in this contract prices anything. The pot is the only money it decides.
/// @dev Card settlement is deliberately independent of the pot. A match whose pot was forfeited or refunded
///      still holds two players' real positions, so `settleCard` keeps working in every status past the
///      reveal — losing a pot must never cost a player the market position they paid for.
/// @dev Storage and events carry market ids only (AD-10). Credits pay the player, never the caller (AD-5).
/// @dev The ledger, the refunds and the agent grants live in `ArenaMatches` and `ArenaAgents`; this contract
///      is the trading half — entry, reveal, picks, lock, settlement, the pot.
contract GameArena is ArenaAgents {
    using SafeERC20 for IERC20;

    constructor(IERC20 collateral_, IEventsEngine engine_, IEngineLens lens_, Params memory params_)
        ArenaAgents(collateral_, engine_, lens_, params_)
    {}

    // ------------------------------------------------------------------ entry

    /// @notice Opens a match against one named opponent and escrows the creator's side-pot.
    /// @dev The challenger is named at creation rather than left open. The deck commitment is taken over
    ///      BOTH players' client seeds, which only exist once the matchmaker has paired them — so an open
    ///      match a stranger could join would publish a commitment binding a seed that stranger never
    ///      chose. Pairing happens off-chain; this is the chain recording it.
    function createMatch(bytes32 matchId, address challenger, uint8 tier, bytes32 deckHash, uint8 deckSize, uint32 policyVersion)
        external
        nonReentrant
    {
        _create(matchId, challenger, tier, deckHash, deckSize, policyVersion);
    }

    /// @notice The same entry, with the seat's agent named in the one transaction — the only signature a
    ///         duel then asks of the creator's wallet.
    function createMatchWithAgent(
        bytes32 matchId,
        address challenger,
        uint8 tier,
        bytes32 deckHash,
        uint8 deckSize,
        uint32 policyVersion,
        address agent,
        uint32 agentTtlSec
    ) external nonReentrant {
        if (agent == address(0)) revert ZeroAddress();
        Match storage m = _create(matchId, challenger, tier, deckHash, deckSize, policyVersion);
        _authorizeAgent(matchId, m, msg.sender, agent, agentTtlSec);
    }

    function _create(bytes32 matchId, address challenger, uint8 tier, bytes32 deckHash, uint8 deckSize, uint32 policyVersion)
        private
        returns (Match storage m)
    {
        if (paused) revert IsPaused();
        if (challenger == address(0)) revert ZeroAddress();
        if (challenger == msg.sender) revert SelfJoin();
        if (deckHash == bytes32(0)) revert DeckMismatch(deckHash, bytes32(0));
        m = _matches[matchId];
        if (m.creator != address(0)) revert MatchExists(matchId);
        Params memory p = params;
        if (deckSize < p.minDeckSize || deckSize > p.maxDeckSize) revert BadDeckSize(deckSize);
        Tier memory t = tierOf[tier];
        if (!t.enabled) revert UnknownTier(tier);

        m.creator = msg.sender;
        m.challenger = challenger;
        m.tier = tier;
        m.status = Status.WAITING;
        m.deckSize = deckSize;
        m.policyVersion = policyVersion;
        m.deckHash = deckHash;
        m.createdAtSec = uint64(block.timestamp);
        m.potBase = t.potBase;
        m.perCardCapBase = t.perCardCapBase;

        if (t.potBase != 0) {
            collateral.safeTransferFrom(msg.sender, address(this), t.potBase);
            escrowed += t.potBase;
        }
        emit MatchCreated(matchId, msg.sender, tier, t.potBase, deckHash, deckSize, m.createdAtSec + p.joinWindowSec);
    }

    /// @notice The named challenger matches the pot. Nothing else can be joined.
    function joinMatch(bytes32 matchId) external nonReentrant {
        _join(matchId);
    }

    /// @notice The challenger's one signature: the pot and the seat's agent together.
    function joinMatchWithAgent(bytes32 matchId, address agent, uint32 agentTtlSec) external nonReentrant {
        if (agent == address(0)) revert ZeroAddress();
        Match storage m = _join(matchId);
        _authorizeAgent(matchId, m, msg.sender, agent, agentTtlSec);
    }

    function _join(bytes32 matchId) private returns (Match storage m) {
        if (paused) revert IsPaused();
        m = _get(matchId);
        if (m.status != Status.WAITING) revert WrongStatus(matchId, m.status);
        if (msg.sender != m.challenger) revert NotAPlayer(msg.sender);
        uint64 deadline = m.createdAtSec + params.joinWindowSec;
        if (block.timestamp > deadline) revert DeadlinePassed(deadline);

        m.status = Status.ACTIVE_UNREVEALED;
        m.joinedAtSec = uint64(block.timestamp);
        if (m.potBase != 0) {
            collateral.safeTransferFrom(msg.sender, address(this), m.potBase);
            escrowed += m.potBase;
        }
        emit MatchJoined(matchId, msg.sender, m.potBase, m.joinedAtSec + params.revealWindowSec);
    }

    /// @notice Opens the deck. Permissionless: whoever holds the preimage may publish it, because the
    ///         commitment — not a key — is what proves the deck was fixed before either player saw it.
    /// @dev The preimage is `masayume/core/games`'s `deckCommitmentPreimage`, word for word:
    ///      chainId, arena, matchId, policyVersion, serverSeed, |clientSeeds|, clientSeeds, |cards|, cards —
    ///      shared with the TypeScript half through `ArenaCommitment`, whose golden vector is in
    ///      `ArenaVectors.t.sol` and `packages/core/src/games/commitment.test.ts`.
    function revealDeck(bytes32 matchId, bytes32 serverSeed, bytes32[] memory clientSeeds, bytes32[] memory cards) external nonReentrant {
        Match storage m = _get(matchId);
        if (m.status != Status.ACTIVE_UNREVEALED) revert WrongStatus(matchId, m.status);
        uint64 deadline = m.joinedAtSec + params.revealWindowSec;
        if (block.timestamp > deadline) revert DeadlinePassed(deadline);
        if (cards.length != m.deckSize) revert BadDeckSize(uint8(cards.length));

        bytes32 got = ArenaCommitment.hash(block.chainid, address(this), matchId, m.policyVersion, serverSeed, clientSeeds, cards);
        if (got != m.deckHash) revert DeckMismatch(m.deckHash, got);

        // Every card must be a live Window of the engine with room left to play, checked before a
        // deadline starts running against players who cannot pick.
        uint32 life = params.minCardLifeSec;
        for (uint256 i = 0; i < cards.length; i++) {
            MarketRef memory ref = _resolve(cards[i]);
            if (ref.lockAt < block.timestamp + life) revert TooLate(cards[i], ref.lockAt);
            // The same Window twice is not a deck: both cards would settle on one print, so a player who
            // read it right once is paid twice for one call and the match stops measuring skill.
            for (uint256 k = 0; k < i; k++) {
                if (cards[k] == cards[i]) revert DuplicateCard(cards[i]);
            }
            _cards[matchId].push(cards[i]);
        }

        m.status = Status.PICKING;
        m.revealedAtSec = uint64(block.timestamp);
        m.pickDeadlineSec = uint64(block.timestamp) + params.pickWindowSec;
        emit DeckRevealed(matchId, m.policyVersion, cards, m.pickDeadlineSec);
    }

    // ------------------------------------------------------------------ the picks

    /// @notice One card, one side, one IOC. `stake` is the most this card may spend; the arena walks the
    ///         live book for what it buys, places the order and sends the unspent part straight back.
    /// @dev Zero fill reverts, so a card is never recorded as played without a position behind it. A
    ///      partial fill above `minQuantityRaw` succeeds and records what actually filled.
    function placePick(bytes32 matchId, uint8 cardIndex, uint8 outcomeIdx, uint256 stake, uint256 minQuantityRaw)
        external
        nonReentrant
        returns (uint256 quantity, uint256 cost)
    {
        return _pick(msg.sender, matchId, cardIndex, outcomeIdx, stake, minQuantityRaw);
    }

    /// @notice The same pick, placed by the seat's agent. The stake comes from `player`, the refund goes to
    ///         `player`, and `PickFilled` names `player` — the key only signs.
    function placePickFor(address player, bytes32 matchId, uint8 cardIndex, uint8 outcomeIdx, uint256 stake, uint256 minQuantityRaw)
        external
        nonReentrant
        returns (uint256 quantity, uint256 cost)
    {
        _requireAgent(matchId, player, stake);
        return _pick(player, matchId, cardIndex, outcomeIdx, stake, minQuantityRaw);
    }

    /// @dev The pick itself, for whichever seat `player` holds. The stake is drawn from the player and
    ///      the unspent part returns to the player, whoever sent the transaction — so an agent's pick
    ///      and the player's own are the same record with the same money behind it.
    function _pick(address player, bytes32 matchId, uint8 cardIndex, uint8 outcomeIdx, uint256 stake, uint256 minQuantityRaw)
        private
        returns (uint256 quantity, uint256 cost)
    {
        if (paused) revert IsPaused();
        Match storage m = _get(matchId);
        if (m.status != Status.PICKING) revert WrongStatus(matchId, m.status);
        if (block.timestamp > m.pickDeadlineSec) revert DeadlinePassed(m.pickDeadlineSec);
        uint8 seat = _seatOf(m, player);
        if (cardIndex >= m.deckSize) revert BadCard(cardIndex);
        if (stake == 0) revert ZeroAmount();
        if (stake > m.perCardCapBase) revert StakeAboveCap(stake, m.perCardCapBase);
        PickRecord storage rec = _picks[matchId][_slot(cardIndex, seat)];
        if (rec.placed) revert AlreadyPicked(matchId, cardIndex, player);

        bytes32 marketId = _cards[matchId][cardIndex];
        MarketRef memory ref = _resolve(marketId);
        Quote memory q = _sizeEntry(marketId, ref, outcomeIdx, stake);
        if (q.quantityRaw < minQuantityRaw) revert BelowMinQuantity(q.quantityRaw, minQuantityRaw);

        collateral.safeTransferFrom(player, address(this), stake);
        (cost, quantity) = _buyIoc(marketId, ref, outcomeIdx, q.limitYesRaw, q.quantityRaw);
        if (quantity == 0 || quantity < minQuantityRaw) revert BelowMinQuantity(quantity, minQuantityRaw);
        // A fill can only cost the walk's limit or less; a venue fee on top would land here and is
        // refused, because paying it would spend another match's pot.
        if (cost > stake) revert CostAboveStake(cost, stake);

        rec.placed = true;
        rec.outcomeIdx = outcomeIdx;
        rec.quantity = _u128(quantity);
        rec.costBase = _u128(cost);
        uint8 bit = uint8(1 << cardIndex);
        if (seat == 0) m.pickedMask0 |= bit;
        else m.pickedMask1 |= bit;

        uint256 refund = stake - cost;
        if (refund != 0) collateral.safeTransfer(player, refund);
        emit PickFilled(matchId, player, marketId, cardIndex, outcomeIdx, quantity, cost, refund);

        // The last pick locks the match itself, so a complete deck never waits on a crank.
        uint8 full = _fullMask(m.deckSize);
        if (m.pickedMask0 == full && m.pickedMask1 == full) {
            m.status = Status.SETTLING;
            emit PicksLocked(matchId, Status.SETTLING, address(0));
        }
    }

    /// @notice Closes the pick window. Permissionless once the deadline has passed.
    /// @dev One absent player forfeits the pot alone; both absent is nobody's win, so both pots go home.
    ///      Neither branch touches the cards already on the book — those settle either way.
    function lockPicks(bytes32 matchId) external nonReentrant {
        Match storage m = _get(matchId);
        if (m.status != Status.PICKING) revert WrongStatus(matchId, m.status);
        if (block.timestamp <= m.pickDeadlineSec) revert DeadlineNotPassed(m.pickDeadlineSec);
        uint8 full = _fullMask(m.deckSize);
        bool creatorDone = m.pickedMask0 == full;
        bool challengerDone = m.pickedMask1 == full;

        if (creatorDone && challengerDone) {
            m.status = Status.SETTLING;
            emit PicksLocked(matchId, Status.SETTLING, address(0));
        } else if (creatorDone || challengerDone) {
            m.status = Status.FORFEITED;
            emit PicksLocked(matchId, Status.FORFEITED, creatorDone ? m.challenger : m.creator);
        } else {
            _refundBoth(matchId, m, RefundReason.BOTH_INCOMPLETE);
        }
    }

    // ------------------------------------------------------------------ settlement

    /// @notice Redeems both seats' picks on one card through the engine and credits what it paid.
    ///         Permissionless, and idempotent by card: a second call reverts rather than double-crediting.
    function settleCard(bytes32 matchId, uint8 cardIndex) external nonReentrant {
        Match storage m = _get(matchId);
        if (m.status == Status.WAITING || m.status == Status.ACTIVE_UNREVEALED) revert WrongStatus(matchId, m.status);
        if (cardIndex >= m.deckSize) revert BadCard(cardIndex);
        uint8 bit = uint8(1 << cardIndex);
        if (m.settledMask & bit != 0) revert AlreadySettled(matchId, cardIndex);

        bytes32 marketId = _cards[matchId][cardIndex];
        MarketRef memory ref = _resolve(marketId);
        if (!_isSettled(marketId)) revert MarketNotSettled(marketId);

        m.settledMask |= bit;
        for (uint8 seat = 0; seat < 2; seat++) {
            PickRecord storage rec = _picks[matchId][_slot(cardIndex, seat)];
            if (!rec.placed || rec.settled) continue;
            uint256 payout = _redeem(marketId, ref, rec.outcomeIdx, rec.quantity);
            rec.settled = true;
            rec.payoutBase = _u128(payout);
            int256 pnl = int256(payout) - int256(uint256(rec.costBase));
            _pnl[matchId][seat] += pnl;
            address player = seat == 0 ? m.creator : m.challenger;
            if (payout != 0) {
                creditOf[player] += payout;
                credited += payout;
            }
            emit CardSettled(matchId, player, marketId, cardIndex, payout, pnl);
        }
    }

    /// @notice Awards the pot once every played card is settled. Permissionless.
    /// @dev Only the side-pot is allocated here; the market payouts were credited card by card. A tie
    ///      splits, and an odd unit of dust goes to the creator so the split is deterministic.
    function finalize(bytes32 matchId) external nonReentrant {
        Match storage m = _get(matchId);
        if (m.status != Status.SETTLING && m.status != Status.FORFEITED) revert WrongStatus(matchId, m.status);
        uint8 played = m.pickedMask0 | m.pickedMask1;
        if (played & ~m.settledMask != 0) revert CardsOutstanding(matchId);

        int256 creatorPnl = _pnl[matchId][0];
        int256 challengerPnl = _pnl[matchId][1];
        address winner;
        if (m.status == Status.FORFEITED) {
            winner = m.pickedMask0 == _fullMask(m.deckSize) ? m.creator : m.challenger;
        } else if (creatorPnl != challengerPnl) {
            winner = creatorPnl > challengerPnl ? m.creator : m.challenger;
        }

        m.status = Status.FINALIZED;
        uint256 pot = uint256(m.potBase) * 2;
        if (pot != 0) {
            escrowed -= pot;
            credited += pot;
            if (winner != address(0)) {
                creditOf[winner] += pot;
            } else {
                uint256 half = pot / 2;
                creditOf[m.challenger] += half;
                creditOf[m.creator] += pot - half;
            }
        }
        emit MatchFinalized(matchId, winner, creatorPnl, challengerPnl, pot);
    }
}
