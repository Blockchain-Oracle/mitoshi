// Ported from Agari 4c0278ad:web/src/features/landing/og/fonts.ts.
/**
 * The preview face. The shell's Sora comes through `next/font/google` as WOFF2, which satori cannot read, so the OFL
 * Sora SemiBold TTF is vendored here with its licence (`fonts/Sora-OFL.txt`). Read from disk once per process: no
 * request-time fetch. `process.cwd()` is the Next project directory (`web/`), as the `next/og` docs load fonts.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SORA_SEMIBOLD = join(process.cwd(), "src/features/og/fonts/Sora-SemiBold.ttf");

let sora: Promise<Buffer> | null = null;

export async function ogFonts() {
  sora ??= readFile(SORA_SEMIBOLD);
  const data = await sora;
  return [{ name: "Sora", data, style: "normal" as const, weight: 600 as const }];
}
