// The arena's winner rule off-chain (R4-9, D-227): `GameArena.finalize`'s own, re-derived from the state it leaves.
import { describe, expect, it } from "vitest";
import type { Address } from "../types/primitives";
import { arenaWinnerOf } from "./arena";

const A = "0x00000000000000000000000000000000000000a1" as Address;
const B = "0x00000000000000000000000000000000000000b2" as Address;
const m = (p0: number, p1: number) => ({ creator: A, challenger: B, deckSize: 3, pickedMask0: p0, pickedMask1: p1 });

describe("arenaWinnerOf", () => {
  it("the greater P&L takes it when both seats played every card", () => {
    expect(arenaWinnerOf(m(7, 7), 500n, -200n)).toBe(A);
    expect(arenaWinnerOf(m(7, 7), -500n, -200n)).toBe(B);
  });
  it("a tie is nobody's (the pot splits)", () => {
    expect(arenaWinnerOf(m(7, 7), 100n, 100n)).toBeNull();
  });
  it("a forfeit goes to the seat that finished, whatever the P&L says", () => {
    expect(arenaWinnerOf(m(7, 1), -900n, 900n)).toBe(A);
    expect(arenaWinnerOf(m(3, 7), 900n, -900n)).toBe(B);
  });
});
