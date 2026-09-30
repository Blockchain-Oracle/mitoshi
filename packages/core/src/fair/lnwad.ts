// Ported from Solady v0.1.26 (acd959a) src/utils/FixedPointMathLib.sol `lnWad` (MIT; Remco Bloemen's (8, 8) rational
// approximation) — the same integer steps in BigInt, so `fair.ts` reproduces `FairValue.sol` bit for bit.

/** Solady `lnWad`: ln(x / 1e18) × 1e18, for x > 0 (Solady reverts `LnWadUndefined` on x ≤ 0; so do we). */
export function lnWad(x: bigint): bigint {
  if (x <= 0n) throw new Error("LnWadUndefined");
  // r = 255 − ⌊log2 x⌋ (Solady's de Bruijn lookup computes exactly this).
  const r = 255n - BigInt(x.toString(2).length - 1);
  // Reduce x to (1, 2) × 2^96: shl(r) puts the top bit at 255, shr(159) keeps 97 bits.
  const xs = (x << r) >> 159n;
  // `sar` is BigInt's `>>` (floor toward −∞), `sdiv` is BigInt's `/` (truncation), as in the EVM; nothing overflows.
  let p = ((((((3273285459638523848632254066296n + xs) * xs) >> 96n) + 24828157081833163892658089445524n) * xs) >> 96n);
  p = (((p + 43456485725739037958740375743393n) * xs) >> 96n) - 11111509109440967052023855526967n;
  p = ((p * xs) >> 96n) - 45023709667254063763336534515857n;
  p = ((p * xs) >> 96n) - 14706773417378608786704636184526n;
  p = p * xs - (795164235651350426258249787498n << 96n);
  let q = 5573035233440673466300451813936n + xs;
  q = 71694874799317883764090561454958n + ((xs * q) >> 96n);
  q = 283447036172924575727196451306956n + ((xs * q) >> 96n);
  q = 401686690394027663651624208769553n + ((xs * q) >> 96n);
  q = 204048457590392012362485061816622n + ((xs * q) >> 96n);
  q = 31853899698501571402653359427138n + ((xs * q) >> 96n);
  q = 909429971244387300277376558375n + ((xs * q) >> 96n);
  p = p / q;
  p = 1677202110996718588342820967067443963516166n * p;
  p = 16597577552685614221487285958193947469193820559219878177908093499208371n * (159n - r) + p;
  p = 600920179829731861736702779321621459595472258049074101567377883020018308n + p;
  return p >> 174n;
}
