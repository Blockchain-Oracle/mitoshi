/**
 * What `/api/games/arcade/board` and `/api/games/arcade/score` say, as the browser reads it. Kept apart
 * from `score.server.ts` so a component can name the shapes without pulling `node:crypto` into a bundle.
 */
export interface BoardRowWire {
  wallet: string;
  score: number;
  calm: boolean;
  at: string;
}

export interface BoardWire {
  configured: boolean;
  /** A fresh seed for the next run, from the server's entropy. */
  seed: string;
  engineVersion: number;
  rows: BoardRowWire[];
  me: { best: number; rank: number } | null;
}

export interface ScoreAcceptedWire {
  rank: number;
  isBest: boolean;
  board: BoardWire;
}
