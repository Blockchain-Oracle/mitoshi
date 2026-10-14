import "server-only";
/**
 * `/download`'s store links as they stand right now (D-230): the env's links (`lib/release.ts`), with the TestFlight
 * link offered only while Apple's join page says the beta takes testers. A public link exists before Apple's beta review
 * passes, and leading an iPhone to "This beta isn't accepting any new testers" is a dead end. Apple's page is read off
 * the request path (`lib/testflight-gate.ts`): a visitor never waits on it after a process's first request, a failed
 * read is retried 30 s later, and an unverified link is never offered. Each change of answer, and each failed read, is
 * a `[download]` line in the web app's log. Google Play's test page needs a signed-in Google account, so the open-test
 * link is taken as set.
 */
import { readStoreRelease, type StoreRelease } from "@/lib/release";
import { createTestflightGate, type TestflightGate } from "@/lib/testflight-gate";

/** One gate per process, kept on `globalThis` so every bundle that imports this module (and a dev reload) shares it. */
const KEY = Symbol.for("mitoshi.download.testflight-gate");
type Holder = { [KEY]?: TestflightGate };

function gate(): TestflightGate {
  const holder = globalThis as Holder;
  holder[KEY] ??= createTestflightGate({ fetch: (input, init) => fetch(input, init), log: (line) => console.info(`[download] ${line}`) });
  return holder[KEY];
}

export async function liveStoreRelease(env: Record<string, string | undefined> = process.env): Promise<StoreRelease> {
  const release = readStoreRelease(env);
  if (!release.testflight) return release;
  const state = await gate().state(release.testflight);
  return state === "open" ? release : { ...release, testflight: null, inReview: state === "closed" };
}
