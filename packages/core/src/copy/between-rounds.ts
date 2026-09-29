// Ported from Masayume 68f7a09:packages/core/src/copy/between-rounds.ts
const SEC_PER_MIN = 60;
const SEC_PER_HOUR = 3600;
const SEC_PER_DAY = 86400;

/** "60s" · "5m" · "1h" · "1d" — the cadence word every lane and blocker uses. */
export function formatCadence(intervalSec: number): string {
  if (intervalSec >= SEC_PER_DAY && intervalSec % SEC_PER_DAY === 0) return `${intervalSec / SEC_PER_DAY}d`;
  if (intervalSec >= SEC_PER_HOUR && intervalSec % SEC_PER_HOUR === 0) return `${intervalSec / SEC_PER_HOUR}h`;
  if (intervalSec >= SEC_PER_MIN && intervalSec % SEC_PER_MIN === 0) return `${intervalSec / SEC_PER_MIN}m`;
  return `${intervalSec}s`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Never negative; scales from "0:42" through "1h 12m" to "1d 3h". */
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec >= SEC_PER_DAY) {
    const days = Math.floor(totalSec / SEC_PER_DAY);
    const hours = Math.floor((totalSec % SEC_PER_DAY) / SEC_PER_HOUR);
    return `${days}d ${hours}h`;
  }
  if (totalSec >= SEC_PER_HOUR) {
    const hours = Math.floor(totalSec / SEC_PER_HOUR);
    const minutes = Math.floor((totalSec % SEC_PER_HOUR) / SEC_PER_MIN);
    return `${hours}h ${pad(minutes)}m`;
  }
  const minutes = Math.floor(totalSec / SEC_PER_MIN);
  return `${minutes}:${pad(totalSec % SEC_PER_MIN)}`;
}

export function betweenRoundsLine(nextStartMs: number | null, nowMs: number, intervalSec: number): string {
  const cadence = formatCadence(intervalSec);
  if (nextStartMs === null) return `Between rounds — no ${cadence} Window is scheduled yet.`;
  return `Between rounds — next ${cadence} Window opens in ${formatDuration(nextStartMs - nowMs)}.`;
}
