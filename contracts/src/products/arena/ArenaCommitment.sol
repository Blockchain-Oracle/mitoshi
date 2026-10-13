// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/games/ArenaCommitment.sol (R4-9, D-227) — word for word: the preimage is
// core `deckCommitmentPreimage` (packages/core/src/games/commitment.ts), golden vector in ArenaVectors.t.sol.

/// @title The exact bytes a deck commitment is taken over.
/// @notice This is the Solidity half of one definition. The other half is `deckCommitmentPreimage` in
///         `packages/core/src/games/commitment.ts`, and `ArenaVectors.t.sol` asserts both produce the
///         same golden bytes. It lives in its own library so there is one place to change, and so the
///         encoding can be tested without staging a whole match.
/// @dev Fixed 32-byte words with an explicit count before each array. The counts are what make the
///      encoding unambiguous: without them, moving an element from `clientSeeds` to `cards` would leave
///      the concatenation unchanged and two different decks would share a commitment.
library ArenaCommitment {
    function preimage(
        uint256 chainId,
        address arena,
        bytes32 matchId,
        uint32 policyVersion,
        bytes32 serverSeed,
        bytes32[] memory clientSeeds,
        bytes32[] memory cards
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(
            chainId,
            bytes32(uint256(uint160(arena))),
            matchId,
            uint256(policyVersion),
            serverSeed,
            clientSeeds.length,
            clientSeeds,
            cards.length,
            cards
        );
    }

    function hash(
        uint256 chainId,
        address arena,
        bytes32 matchId,
        uint32 policyVersion,
        bytes32 serverSeed,
        bytes32[] memory clientSeeds,
        bytes32[] memory cards
    ) internal pure returns (bytes32) {
        return keccak256(preimage(chainId, arena, matchId, policyVersion, serverSeed, clientSeeds, cards));
    }
}
