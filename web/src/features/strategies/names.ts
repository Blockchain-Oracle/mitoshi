// Ported from Owarine 90a91d71:web/src/features/strategies/names.ts (R4-6, D-227) — deterministic identity marks from a
// seed (a codename instead of a bare 0x…, the idle phase of a portrait) and the short "3m ago" the cards and rows use.
const NAME_FIRST = ["Kai", "Mara", "Devin", "Yuki", "Rosa", "Theo", "Nadia", "Owen", "Lena", "Arun", "Mika", "Cole", "Sana", "Bruno", "Ivy", "Rey", "Hana", "Milo", "Zara", "Finn", "Noor", "Dario", "Elle", "Kenji"];
const NAME_LAST = ["Ryder", "Vance", "Okafor", "Tanaka", "Mercer", "Duval", "Sato", "Brooks", "Novak", "Reyes", "Holt", "Ansari", "Frost", "Kang", "Beck", "Costa", "Wray", "Ito", "Nash", "Ozturk", "Vega", "Lund", "Hale", "Mori"];
const PHASES = 8;

function hashOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return h;
}

/** A person to remember instead of a bare 0x… address; stable per seed. */
export function codenameFromAddress(seed: string): string {
  const h = hashOf(seed);
  return `${NAME_FIRST[Math.abs(h) % NAME_FIRST.length]} ${NAME_LAST[Math.abs(h >> 5) % NAME_LAST.length]}`;
}

/** 0–7 from the seed: a portrait's idle phase, so a grid never bobs in unison. */
export function accentIndex(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % PHASES;
}

export const shortAddress = (a: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** "never" for 0, else s/m/h/d ago. */
export function ago(thenMs: number, nowMs: number): string {
  if (!thenMs) return "never";
  const s = Math.max(0, Math.floor((nowMs - thenMs) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
