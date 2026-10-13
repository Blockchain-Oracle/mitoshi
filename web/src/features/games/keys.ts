/**
 * The games' storage keys (R4-9, D-227): `mitoshi.games.*`. The Owarine-era `owarine.games.*` key a returning player
 * still holds is read once as the fallback and moved, so no setting is lost to the rename.
 */
const LEGACY = "owarine.games.";

export function gameKey(name: string): string {
  const key = `mitoshi.games.${name}`;
  try {
    const store = globalThis.localStorage;
    if (store && store.getItem(key) === null) {
      const old = store.getItem(LEGACY + name);
      if (old !== null) store.setItem(key, old);
      store.removeItem(LEGACY + name);
    }
  } catch {
    // storage refused — the new key simply starts empty
  }
  return key;
}
