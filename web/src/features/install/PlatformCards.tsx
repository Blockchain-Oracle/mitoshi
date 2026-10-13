// `/download`'s three cards (D-230): iPhone, Android and the web app, read per request — the store links from the
// environment (`lib/release.ts`, set on the deployment without a rebuild; a TestFlight link counts only while Apple's
// page takes testers, `server/store-release.ts`) and the device from the user agent, so the card for this device leads
// (`cards.tsx`). A phone whose store test isn't open yet leads with the web app, which installs today: the first screen
// always holds an action that works. Inside the phone app's own web view its card leads and says "Installed". The
// browser, from the same user agent, says where it keeps "install" (`browser.ts`).
import { headers } from "next/headers";
import { platformOf } from "@/lib/release";
import { serverEnv } from "@/server/env";
import { liveStoreRelease } from "@/server/store-release";
import { installHintOf } from "./browser";
import { platformCards } from "./cards";
import { PlatformGrid } from "./PlatformCard";

export async function PlatformCards() {
  const userAgent = (await headers()).get("user-agent");
  const { platform, inApp } = platformOf(userAgent);
  const release = await liveStoreRelease();
  const cards = platformCards({ platform, inApp, release, origin: serverEnv().appOrigin, hint: installHintOf(userAgent) });
  return <PlatformGrid cards={cards} />;
}
