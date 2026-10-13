// Ported from Owarine 90a91d71:packages/core/src/input/keypad.ts (R4-2, D-227) — the kit Keypad's pure machine.
/**
 * The amount keypad's state machine (UGLYCASH's big keypad: digits, a decimal point, delete). Pure, so web and the
 * app share one behaviour and it is tested once. The value is the string the user typed, never a float.
 */
export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "del";

export interface KeypadRules {
  /** Digits allowed after the point (2 for dollars). 0 disables the point. */
  maxDecimals: number;
  /** Digits allowed before the point, so a stray press cannot type a number no balance could hold. */
  maxIntegers: number;
}

export const DOLLAR_KEYPAD: KeypadRules = { maxDecimals: 2, maxIntegers: 9 };

/** The next typed string after one key, or the same string when the key is refused. */
export function pressKey(value: string, key: KeypadKey, rules: KeypadRules = DOLLAR_KEYPAD): string {
  if (key === "del") return value.slice(0, -1);
  const [int = "", frac] = value.split(".");
  if (key === ".") {
    if (rules.maxDecimals === 0 || frac !== undefined) return value;
    return (value === "" ? "0" : value) + ".";
  }
  if (frac !== undefined) return frac.length >= rules.maxDecimals ? value : value + key;
  if (int === "0") return key; // a leading zero is replaced, never prefixed: 0 then 5 is 5
  if (int.length >= rules.maxIntegers) return value;
  return value + key;
}

/** The typed string in minor units (cents for 2 decimals); "" and "0." are zero. */
export function keypadToMinor(value: string, decimals: number = DOLLAR_KEYPAD.maxDecimals): bigint {
  if (value === "" || value === ".") return 0n;
  const [int = "0", frac = ""] = value.split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(int || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

/** What the display shows for a typed string: "$0" when empty, thousands grouped, the typed decimals kept as typed. */
export function keypadDisplay(value: string, symbol = "$"): string {
  if (value === "") return `${symbol}0`;
  const [int = "0", frac] = value.split(".");
  const grouped = BigInt(int || "0").toLocaleString("en-US");
  return frac === undefined ? `${symbol}${grouped}` : `${symbol}${grouped}.${frac}`;
}
