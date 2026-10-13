// The Apple App Site Association (D-227, MOBILE; docs/specs/mobile.md D.4): universal links and the passkey
// (`webcredentials`) association for the iOS app, as application/json at this exact path with no redirect. It answers
// on the app's host and passkey rpId (mitoshi.xyz) and on the old testnet.mitoshi.xyz, whose links still open the app
// (D-228; proxy.ts redirects every other path there, never this one).
import { appleAppSiteAssociation } from "@/lib/app-links";

export function GET() {
  return Response.json(appleAppSiteAssociation(), { headers: { "cache-control": "public, max-age=3600" } });
}
