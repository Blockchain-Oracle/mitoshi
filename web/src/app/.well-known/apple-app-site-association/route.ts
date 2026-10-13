// The Apple App Site Association (D-227, MOBILE; docs/specs/mobile.md D.4): universal links and the passkey
// (`webcredentials`) association for the iOS app, as application/json at this exact path with no redirect. It must
// answer on the passkey rpId's host (mitoshi.xyz) as well as testnet.mitoshi.xyz (proxy.ts lets it through there).
import { appleAppSiteAssociation } from "@/lib/app-links";

export function GET() {
  return Response.json(appleAppSiteAssociation(), { headers: { "cache-control": "public, max-age=3600" } });
}
