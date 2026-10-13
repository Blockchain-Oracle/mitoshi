// Whether this browser holds a signed-in session that will restore (R6 shell T14): wagmi's persisted store
// (`cookieStorage`, `wagmi.store`) names a current connection. A sign-out leaves `"current":null` while
// `wagmi.recentConnectorId` stays, so the last-used id alone is no session — reading it as one made every first tap of a
// signed-out visitor "restore" for up to 3 s (the plate flipped to TESTNET, Sign in went blank) and loaded the wallet
// runtime eagerly. The init script's `guessMode` (lib/theme.ts) reads the same thing.
const STORED_SESSION = /(?:^|;\s*)wagmi\.store=[^;]*"current":"/;

export function hasStoredConnection(cookie: string): boolean {
  if (STORED_SESSION.test(cookie)) return true;
  try {
    return STORED_SESSION.test(decodeURIComponent(cookie));
  } catch {
    return false;
  }
}
