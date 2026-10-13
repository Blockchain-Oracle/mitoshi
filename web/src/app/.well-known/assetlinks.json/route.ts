// Digital Asset Links (D-227, MOBILE; docs/specs/mobile.md D.4): App Links and passkeys (`get_login_creds`) for the
// Android app, as application/json with no redirect, on the app's host and passkey rpId (mitoshi.xyz) and on the old
// testnet.mitoshi.xyz, whose links still open the app (D-228).
import { assetLinks } from "@/lib/app-links";

export function GET() {
  return Response.json(assetLinks(), { headers: { "cache-control": "public, max-age=3600" } });
}
