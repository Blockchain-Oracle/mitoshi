import "server-only";
/**
 * `/download`'s store links as they stand right now (D-230): the env's links (`lib/release.ts`), less a TestFlight link
 * whose join page says the beta takes no one yet — a public link exists before Apple's beta review passes, and leading
 * an iPhone to "This beta isn't accepting any new testers" is a dead end. Apple's page is read at most every few minutes
 * (`use cache` with `cacheLife("minutes")`); a failed read is never cached and keeps the link (Apple's page then speaks
 * for itself). Google Play's test pages need a signed-in Google account, so they are taken as set.
 */
import { cacheLife } from "next/cache";
import { readStoreRelease, testflightClosed, type StoreRelease } from "@/lib/release";

/** Throws when Apple's page can't be read, so a failed read is never what the cache keeps. */
async function testflightTakesTesters(url: string): Promise<boolean> {
  "use cache";
  cacheLife("minutes");
  const res = await fetch(url, { headers: { "accept-language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`TestFlight join page ${res.status}`);
  return !testflightClosed(await res.text());
}

export async function liveStoreRelease(env: Record<string, string | undefined> = process.env): Promise<StoreRelease> {
  const release = readStoreRelease(env);
  if (!release.testflight) return release;
  const open = await testflightTakesTesters(release.testflight).catch(() => true);
  return open ? release : { ...release, testflight: null };
}
