// The live store buttons for the landing's final section (round 7): the release read per request (`liveStoreRelease`:
// TestFlight while Apple takes testers, Play's open test) inside Suspense, its outline while it reads.
import { connection } from "next/server";
import { StoreBadges } from "@/components/brand/StoreBadges";
import { liveStoreRelease } from "@/server/store-release";

export async function AppStores() {
  await connection();
  return <StoreBadges release={await liveStoreRelease()} />;
}

/** Two badge-sized bones, so nothing moves when the buttons land. */
export function StoresWait() {
  return (
    <div className="sb-row" aria-hidden>
      <span className="skel sb-bone" />
      <span className="skel sb-bone" />
    </div>
  );
}
