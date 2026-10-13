/**
 * The move as a signed percentage, computed in integers and only made a float to be printed (the race rows and the
 * reveal, `BeatParts.tsx`; R4-9, D-227 — the old two-line row gave way to Senryo's race row).
 */
export function movePercent(entryRaw: bigint, closeRaw: bigint): string {
  if (entryRaw === 0n) return "—";
  const thousandthsOfPercent = ((closeRaw - entryRaw) * 100_000n) / entryRaw;
  const value = Number(thousandthsOfPercent) / 1_000;
  return `${value > 0 ? "+" : ""}${value.toFixed(3)}%`;
}
