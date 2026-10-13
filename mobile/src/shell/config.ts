// The shell's fixed facts (D-227, MOBILE; docs/specs/mobile.md D.2): the site it opens, the passkey rpId whose hosts
// stay inside the web view, the app's link scheme, and the user-agent marker the web reads to know it runs in the app.
import Constants from "expo-constants";
import { Platform } from "react-native";

interface WebExtra {
  origin: string;
  rpId: string;
}

const config = Constants.expoConfig;
const web = (config?.extra?.web ?? {}) as Partial<WebExtra>;

/** The site the app opens (app.identity.json `webOrigin`). */
export const WEB_ORIGIN = web.origin ?? "https://mitoshi.xyz";
/** The passkey relying party (app.identity.json `passkeyRpId`); it and its subdomains are Mitoshi's hosts. */
export const RP_ID = web.rpId ?? "mitoshi.xyz";
/** `mitoshi` (app.identity.json `scheme`): `mitoshi://markets/BTC` opens /markets/BTC. */
export const SCHEME = (Array.isArray(config?.scheme) ? config.scheme[0] : config?.scheme) ?? "mitoshi";

/**
 * D.2's marker, appended to the platform's own user agent: `CWFShell/<app version> (<ios|android>; testnet)`. Inside
 * the page `window.ReactNativeWebView` is defined too (lib/open-external.ts and features/install read it).
 */
export const USER_AGENT_MARK = `CWFShell/${config?.version ?? "0"} (${Platform.OS}; testnet)`;
