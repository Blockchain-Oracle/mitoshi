// `/download`'s three cards (D-230): iPhone, Android and the web app, read per request — the store links from the
// environment (`lib/release.ts`, set on the deployment without a rebuild) and the device from the user agent, so the
// card for this device leads (`cards.tsx`). A phone whose store test isn't open yet leads with the web app, which
// installs today: the first screen always holds an action that works. Inside the phone app's own web view its card
// leads and says "Installed".
import { headers } from "next/headers";
import { platformOf, readStoreRelease } from "@/lib/release";
import { serverEnv } from "@/server/env";
import { platformCards } from "./cards";
import { PlatformGrid } from "./PlatformCard";

export async function PlatformCards() {
  const { platform, inApp } = platformOf((await headers()).get("user-agent"));
  const cards = platformCards({ platform, inApp, release: readStoreRelease(process.env), origin: serverEnv().appOrigin });
  return <PlatformGrid cards={cards} />;
}
