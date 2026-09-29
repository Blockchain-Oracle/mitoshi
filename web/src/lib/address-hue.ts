// Ported from Masayume 68f7a09:web/src/lib/address-hue.ts
/**
 * A stable hue per address, so one wallet is one colour with no profile store
 * behind it — the reference's own function (`CommentRoom.tsx` L35–39,
 * `TakeReelCard.tsx` L36–40), kept in one place.
 */
export function addressHue(address: string): number {
  let value = 0;
  for (let i = 2; i < Math.min(address.length, 12); i += 1) value = (value * 31 + address.charCodeAt(i)) % 360;
  return value;
}
