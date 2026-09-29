// Ported from Masayume 68f7a09:packages/core/src/copy/question.ts
import { formatOracleRaw } from "../units/format";
import { formatCadence } from "./between-rounds";

export interface PlainQuestion {
  text: string;
  /** True while the opening print has not landed — the question has no level yet, and none is invented. */
  pending: boolean;
}

export const PLAIN_WORDS = {
  yes: "Yes",
  no: "No",
  pendingPrint: "waiting for the opening print",
} as const;

interface QuestionInput {
  asset: string;
  intervalSec: number;
  openingPriceRaw: bigint | null;
}

interface WordQuestionInput extends QuestionInput {
  marketId: string;
}

/**
 * The word board's phrasings, from `reference/yosuku/components/WordMarketBoard.tsx` L36–41.
 *
 * Four of them so a grid of questions does not read as one sentence repeated.
 * The reference hardcodes "Bitcoin"/"BTC"; the asset is a field here because lanes
 * come from whatever the venue lists.
 */
const WORD_TEMPLATES: readonly ((asset: string, level: string, clock: string) => string)[] = [
  (asset, level, clock) => `Will ${asset} be above $${level} at ${clock}?`,
  (asset, level, clock) => `${asset} still over $${level} when the clock hits ${clock}?`,
  (asset, level, clock) => `Will ${asset} hold $${level} through ${clock}?`,
  (asset, level, clock) => `${asset} above $${level} by ${clock}?`,
];

/**
 * Which phrasing a market gets, fixed for its lifetime.
 *
 * The reference picks on the array index (`TEMPLATES[i % 4]`), so every card on the
 * board was reworded whenever a Window closed and the list shifted under it. Keying
 * on the id instead means a question you are reading does not rephrase itself.
 */
function templateFor(marketId: string): number {
  let hash = 0;
  for (let i = 0; i < marketId.length; i += 1) hash = (hash * 31 + marketId.charCodeAt(i)) >>> 0;
  return hash % WORD_TEMPLATES.length;
}

/**
 * The same Window as a time-scheduled question: "Will BTC be above $X at 3:45?".
 *
 * `closeClock` is passed already formatted so this module stays free of locale and
 * timezone. As with `plainQuestion`, the level is the **opening print** — the number
 * the Window actually settles against. The reference derives a strike from spot,
 * which a real on-chain line does not need.
 */
export function wordQuestion(market: WordQuestionInput, oracleScale: number, closeClock: string): PlainQuestion {
  if (market.openingPriceRaw === null) {
    return { text: `Will ${market.asset} be above its opening print at ${closeClock}? (${PLAIN_WORDS.pendingPrint})`, pending: true };
  }
  const level = formatOracleRaw(market.openingPriceRaw, oracleScale);
  const template = WORD_TEMPLATES[templateFor(market.marketId)] ?? WORD_TEMPLATES[0]!;
  return { text: template(market.asset, level, closeClock), pending: false };
}

/** Restates an up/down Window as a yes/no question from typed fields only — question text is never parsed (canon #13). */
export function plainQuestion(market: QuestionInput, oracleScale: number): PlainQuestion {
  const cadence = formatCadence(market.intervalSec);
  if (market.openingPriceRaw === null) {
    return { text: `Will ${market.asset} close this ${cadence} Window at or above its opening print? (${PLAIN_WORDS.pendingPrint})`, pending: true };
  }
  const level = formatOracleRaw(market.openingPriceRaw, oracleScale);
  return { text: `Will ${market.asset} close this ${cadence} Window at or above $${level}?`, pending: false };
}
