// Digital Asset Links (D-227, MOBILE; docs/specs/mobile.md D.4): App Links and passkeys (`get_login_creds`) for the
// Android app, as application/json with no redirect, on the passkey rpId's host (mitoshi.xyz) and on
// testnet.mitoshi.xyz.
import { assetLinks } from "@/lib/app-links";

export function GET() {
  return Response.json(assetLinks(), { headers: { "cache-control": "public, max-age=3600" } });
}
