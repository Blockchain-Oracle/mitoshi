// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/ArenaVectors.t.sol (R4-9, D-227) — verbatim: the golden bytes are the
// ones packages/core/src/games/commitment.test.ts asserts.

import {Test} from "forge-std/Test.sol";
import {ArenaCommitment} from "../../../src/products/arena/ArenaCommitment.sol";

/// @notice The deck commitment's golden vector, asserted against the same literal bytes that
///         `packages/core/src/games/commitment.test.ts` asserts `deckCommitmentPreimage` against. The
///         matchmaker publishes a commitment the browser computed and the arena verifies a reveal the
///         chain computed; if these two encodings ever diverge, every reveal stops verifying — so the
///         literal below is the contract between them, and it is not derived from either side.
contract ArenaVectorsTest is Test {
    uint256 internal constant CHAIN_ID = 50_312;
    address internal constant ARENA = 0xAAaA000000000000000000000000000000000001;

    function _input() internal pure returns (bytes32 matchId, bytes32 serverSeed, bytes32[] memory seeds, bytes32[] memory cards) {
        matchId = bytes32(_repeat(0x11));
        serverSeed = bytes32(_repeat(0x22));
        seeds = new bytes32[](2);
        seeds[0] = bytes32(_repeat(0x33));
        seeds[1] = bytes32(_repeat(0x44));
        cards = new bytes32[](3);
        cards[0] = bytes32(_repeat(0xa1));
        cards[1] = bytes32(_repeat(0xb2));
        cards[2] = bytes32(_repeat(0xc3));
    }

    /// @dev One byte repeated across all 32, the way the TypeScript vector writes `"11".repeat(32)`.
    function _repeat(uint8 b) internal pure returns (uint256 word) {
        for (uint256 i = 0; i < 32; i++) {
            word = (word << 8) | b;
        }
    }

    function test_preimage_matchesTheTypescriptGoldenVector() public pure {
        (bytes32 matchId, bytes32 serverSeed, bytes32[] memory seeds, bytes32[] memory cards) = _input();
        bytes memory got = ArenaCommitment.preimage(CHAIN_ID, ARENA, matchId, 1, serverSeed, seeds, cards);
        bytes memory want = abi.encodePacked(
            hex"000000000000000000000000000000000000000000000000000000000000c488",
            hex"000000000000000000000000aaaa000000000000000000000000000000000001",
            hex"1111111111111111111111111111111111111111111111111111111111111111",
            hex"0000000000000000000000000000000000000000000000000000000000000001",
            hex"2222222222222222222222222222222222222222222222222222222222222222",
            hex"0000000000000000000000000000000000000000000000000000000000000002",
            hex"3333333333333333333333333333333333333333333333333333333333333333",
            hex"4444444444444444444444444444444444444444444444444444444444444444",
            hex"0000000000000000000000000000000000000000000000000000000000000003",
            hex"a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
            hex"b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2",
            hex"c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3"
        );
        assertEq(got.length, 12 * 32, "twelve words");
        assertEq(keccak256(got), keccak256(want), "preimage diverged from the TypeScript encoding");
    }

    /// @dev The counts before each array are the only thing stopping this collision; without them, moving
    ///      a word from the seeds to the cards leaves the concatenation byte-identical.
    function test_countsMakeTheEncodingUnambiguous() public pure {
        (bytes32 matchId, bytes32 serverSeed, bytes32[] memory seeds, bytes32[] memory cards) = _input();
        bytes32[] memory movedSeeds = new bytes32[](3);
        movedSeeds[0] = seeds[0];
        movedSeeds[1] = seeds[1];
        movedSeeds[2] = cards[0];
        bytes32[] memory movedCards = new bytes32[](2);
        movedCards[0] = cards[1];
        movedCards[1] = cards[2];

        bytes32 base = ArenaCommitment.hash(CHAIN_ID, ARENA, matchId, 1, serverSeed, seeds, cards);
        assertTrue(base != ArenaCommitment.hash(CHAIN_ID, ARENA, matchId, 1, serverSeed, movedSeeds, movedCards), "moved word collided");
    }

    function test_commitmentIsBoundToChainArenaMatchAndPolicy() public pure {
        (bytes32 matchId, bytes32 serverSeed, bytes32[] memory seeds, bytes32[] memory cards) = _input();
        bytes32 base = ArenaCommitment.hash(CHAIN_ID, ARENA, matchId, 1, serverSeed, seeds, cards);
        assertTrue(base != ArenaCommitment.hash(1, ARENA, matchId, 1, serverSeed, seeds, cards), "chain id not bound");
        assertTrue(base != ArenaCommitment.hash(CHAIN_ID, address(0xBEEF), matchId, 1, serverSeed, seeds, cards), "arena not bound");
        assertTrue(base != ArenaCommitment.hash(CHAIN_ID, ARENA, bytes32(uint256(1)), 1, serverSeed, seeds, cards), "match id not bound");
        assertTrue(base != ArenaCommitment.hash(CHAIN_ID, ARENA, matchId, 2, serverSeed, seeds, cards), "policy version not bound");
    }
}
