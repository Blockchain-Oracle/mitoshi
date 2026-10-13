import "server-only";
// Ported from Owarine 90a91d71:web/src/features/x/config.server.ts — S11 (D-227): OAuth 2.0 with PKCE is the sign-in
// (the X app "mitoshi-testnet" holds a client pair; Owarine's 1.0a consumer pair is the fallback when only it is set),
// and the executor an EXECUTOR grant names comes from the running relay (`/x/relay` on ops), never guessed.
/**
 * What the X rail needs from the environment, and what is missing. Every route answers `{ configured: false, missing }`
 * rather than failing when a variable is absent, so the pages keep their controls and say what would connect them.
 */
export type XCredentials = { kind: "oauth2"; clientId: string; clientSecret: string } | { kind: "oauth1"; consumerKey: string; consumerSecret: string };

export interface XConfig {
  credentials: XCredentials;
  redirectUri: string;
  sessionSecret: string;
}

export type XConfigReading = { configured: true; config: XConfig } | { configured: false; missing: string[] };

export const X_ENV = {
  clientId: "X_OAUTH2_CLIENT_ID",
  clientSecret: "X_OAUTH2_CLIENT_SECRET",
  consumerKey: "X_API_KEY",
  consumerSecret: "X_API_KEY_SECRET",
  redirectUri: "X_REDIRECT_URI",
  sessionSecret: "X_SESSION_SECRET",
} as const;

/** The session key signs who is signed in with X; a short one would be guessable, so it must be at least 32 bytes. */
const MIN_SECRET = 32;

export function readXConfig(origin: string, env: NodeJS.ProcessEnv = process.env): XConfigReading {
  const clientId = env.X_OAUTH2_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.X_OAUTH2_CLIENT_SECRET?.trim() ?? "";
  const consumerKey = env.X_API_KEY?.trim() ?? "";
  const consumerSecret = env.X_API_KEY_SECRET?.trim() ?? "";
  const sessionSecret = env.X_SESSION_SECRET?.trim() ?? "";
  const credentials: XCredentials | null =
    clientId && clientSecret ? { kind: "oauth2", clientId, clientSecret } : consumerKey && consumerSecret ? { kind: "oauth1", consumerKey, consumerSecret } : null;
  const missing: string[] = [];
  if (!credentials) missing.push(X_ENV.clientId, X_ENV.clientSecret);
  if (sessionSecret.length < MIN_SECRET) missing.push(X_ENV.sessionSecret);
  if (!credentials || missing.length > 0) return { configured: false, missing };
  return { configured: true, config: { credentials, redirectUri: env.X_REDIRECT_URI?.trim() || `${origin}/api/x/callback`, sessionSecret } };
}

/** The bot's handle a mention addresses (public). */
export const xBotHandle = (env: NodeJS.ProcessEnv = process.env): string => (env.NEXT_PUBLIC_X_HANDLE?.trim() || env.X_HANDLE?.trim() || "Mitoshi_app").replace(/^@/, "");
