// Ported from Masayume 68f7a09:packages/core/src/games/arcade/index.ts
/**
 * The arcade pair's engines: Line Rider and Candle Hop as pure, seeded, fixed-step simulations, with
 * the trace a browser records and the replay a server runs over it. Nothing here draws, sounds, or
 * touches a chain; `06-game-architecture.md` §`/games/line-rider` and `/games/candle-hop`.
 */
export * from "./field";
export * from "./flap";
export * from "./replay";
export * from "./ride";
export * from "./rng";
export * from "./sled";
export * from "./sled-world";
export * from "./trace";
