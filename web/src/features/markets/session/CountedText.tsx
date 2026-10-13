/**
 * A wait line whose count ticks every second ("Opened 15:05:00 · waiting 0:42 …", D-230) inside a live region: the
 * words are announced when they change, the count is not (`aria-live="off"`), or a screen reader would read the whole
 * line out every second for as long as the wait lasts. Text with no count renders as it is.
 */
import { splitCount } from "../data/opening-wait";

export function CountedText({ text }: { text: string }) {
  const parts = splitCount(text);
  if (!parts) return <>{text}</>;
  return (
    <>
      {parts.before}
      <span aria-live="off">{parts.count}</span>
      {parts.after}
    </>
  );
}
