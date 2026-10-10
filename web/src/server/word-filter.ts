import "server-only";
/**
 * The word filter on social text (S13, D-043 "filter"): obscenity's English dataset with its recommended transformers
 * (leetspeak, confusables, repeated letters, words run together). Its own docs call it a heuristic, so nothing is refused
 * on a match: the original stays for moderators, and every reader gets the matched words starred out.
 */
import { asteriskCensorStrategy, englishDataset, englishRecommendedTransformers, RegExpMatcher, TextCensor } from "obscenity";

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
const censor = new TextCensor().setStrategy(asteriskCensorStrategy());

/** The text as readers see it. */
export function clean(text: string): string {
  const matches = matcher.getAllMatches(text);
  return matches.length ? censor.applyTo(text, matches) : text;
}

/** True when the filter would star anything (a report's context for moderators). */
export function flagged(text: string): boolean {
  return matcher.hasMatch(text);
}
