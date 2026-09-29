// Ported from Masayume 68f7a09:packages/brain/src/index.ts
/**
 * @cwf/brain — the one language-model client the workspace shares (web's Sensei and ops' agent runner): a model
 * resolved from configuration (a key, the AI Gateway, or `via: 'mpp'` paid per request on Tempo), one structured read
 * per Window, and the decide step that turns a read into a `Decision` through the core's deterministic gate. Nothing
 * here can sign or send; an MPP route receives a payment-aware `fetch` from `@cwf/markets/server`.
 */
export const BRAIN_PACKAGE = "@cwf/brain" as const;

export * from "./agent-decide";
export * from "./agent-read";
export * from "./model";
