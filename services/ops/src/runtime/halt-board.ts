// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/runtime/halt-board.ts
/**
 * The process's halt board (C.5.2 halt-watch): `halt-watch` is its single writer, everything else reads a copy.
 * In memory only: a restart starts empty and `halt-watch` re-derives every halt within one pass.
 */
import type { HaltBoard, HaltReason } from "@cwf/core";

type HaltAsset = keyof HaltBoard;

export interface HaltBoardStore {
  board(): HaltBoard;
  /** Marks `asset` halted; keeps `sinceSec` while the reason is unchanged. */
  set(asset: HaltAsset, reason: HaltReason, nowSec: number): void;
  clear(asset: HaltAsset): void;
  /** Every change, for the stream's `halts` topic. */
  subscribe(listener: (board: HaltBoard) => void): () => void;
}

export function createHaltBoard(): HaltBoardStore {
  const entries: HaltBoard = {};
  const listeners = new Set<(board: HaltBoard) => void>();
  const emit = () => listeners.forEach((l) => l({ ...entries }));
  return {
    board: () => ({ ...entries }),
    set(asset, reason, nowSec) {
      if (entries[asset]?.reason === reason) return;
      entries[asset] = { reason, sinceSec: nowSec };
      emit();
    },
    clear(asset) {
      if (!entries[asset]) return;
      delete entries[asset];
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
