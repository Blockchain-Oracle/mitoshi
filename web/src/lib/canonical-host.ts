// One address for the app (D-228): it answers at APP_ORIGIN (https://mitoshi.xyz). Every other Mitoshi host that
// reaches the web app — the old testnet.mitoshi.xyz, www.mitoshi.xyz — sends each request there, path and query kept.
// /.well-known/* answers on every host with no redirect: Apple and Google read the association files from each host
// an app link or the passkey names, and neither follows a redirect. Hosts that aren't Mitoshi's (localhost, Coolify's
// health check, an sslip.io fallback) are left alone.

export interface CanonicalEnv {
  /** APP_ORIGIN: the app's one origin. */
  appOrigin?: string;
  /** PASSKEY_RP_ID: the registrable domain (D-060); it and every name under it are Mitoshi's. Defaults to the app's host. */
  rpId?: string;
}

export interface Moved {
  location: string;
  /** 301 for reads; 308 keeps a POST a POST (a 301 lets clients resend it as a GET with no body). 307 while the app
   *  is not at the apex (APP_ORIGIN still names another host): browsers keep a permanent redirect, and the apex must
   *  never be cached as pointing away from itself. */
  status: 301 | 307 | 308;
}

const hostname = (host: string) => host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");

export function canonicalRedirect(
  request: { host: string | null; pathname: string; search: string; method: string },
  env: CanonicalEnv,
): Moved | null {
  if (!env.appOrigin || !request.host) return null;
  let app: URL;
  try {
    app = new URL(env.appOrigin);
  } catch {
    return null;
  }
  const host = hostname(request.host);
  const rpId = hostname(env.rpId || app.hostname);
  if (host === app.hostname) return null;
  if (host !== rpId && !host.endsWith(`.${rpId}`)) return null;
  if (request.pathname.startsWith("/.well-known/")) return null;
  // Set on the app's origin, not resolved against it: a path such as `//evil.example` must stay a path.
  const location = new URL(app.origin);
  location.pathname = request.pathname;
  location.search = request.search;
  if (app.hostname !== rpId) return { location: location.toString(), status: 307 };
  const method = request.method.toUpperCase();
  return { location: location.toString(), status: method === "GET" || method === "HEAD" ? 301 : 308 };
}
