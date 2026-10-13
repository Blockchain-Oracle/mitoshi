#!/usr/bin/env node
/**
 * TestFlight through the App Store Connect API (D-227, MOBILE), with the API key eas.json's iOS submit names. `ship`
 * is idempotent — each step checks first and skips what is already done (by hand, by another agent or by a run before):
 *   1. waits for the build to finish processing; answers export compliance (no non-exempt encryption) if it is unset;
 *   2. "What to Test" on the build, and the app's test information (description, feedback email, privacy policy) and
 *      beta review notes from store/listing.json — the review contact comes from the account holder, never invented;
 *   3. an internal group (every build) with the account holder in it;
 *   4. an external group "Public" with a public link, the build added, and the build submitted for beta app review.
 *
 *   node mobile/scripts/testflight.mjs status [--build-number 6]
 *   node mobile/scripts/testflight.mjs ship --build-number 6
 *
 * The app is eas.json's `ascAppId` (`--app` overrides). The .p8 key never leaves this process: it signs a 20-minute JWT.
 */
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ios = JSON.parse(readFileSync(resolve(mobile, "eas.json"), "utf8")).submit.production.ios;
const listing = JSON.parse(readFileSync(resolve(mobile, "store/listing.json"), "utf8"));
const [command, ...rest] = process.argv.slice(2);
const opt = (name) => (rest.includes(`--${name}`) ? rest[rest.indexOf(`--${name}`) + 1] : null);
const appId = opt("app") ?? ios.ascAppId;
const buildNumber = opt("build-number");
const PUBLIC_GROUP = "Public";
const LOCALE = listing.language;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "ES256", kid: ios.ascApiKeyId, typ: "JWT" })}.${b64({ iss: ios.ascApiKeyIssuerId, iat: now, exp: now + 1100, aud: "appstoreconnect-v1" })}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key: createPrivateKey(readFileSync(ios.ascApiKeyPath)), dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${signature.toString("base64url")}`;
}

async function api(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { authorization: `Bearer ${jwt()}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    const error = new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 1500)}`);
    error.status = res.status;
    throw error;
  }
  return text ? JSON.parse(text) : {};
}
const rel = (type, id) => ({ data: { type, id } });

async function findBuild() {
  const q = `/v1/builds?filter[app]=${appId}&filter[version]=${buildNumber}&filter[preReleaseVersion.platform]=IOS&include=buildBetaDetail&limit=1`;
  const res = await api("GET", q);
  const build = res.data[0];
  if (!build) return null;
  const detail = (res.included ?? []).find((i) => i.type === "buildBetaDetails");
  return { build, detail };
}

async function waitForBuild() {
  const deadline = Date.now() + 90 * 60_000;
  for (;;) {
    const found = await findBuild();
    const state = found?.build.attributes.processingState ?? "not in App Store Connect yet";
    if (state === "VALID") return found;
    if (state === "FAILED" || state === "INVALID") throw new Error(`build ${buildNumber} is ${state}`);
    if (Date.now() > deadline) throw new Error(`build ${buildNumber} still ${state} after 90 minutes`);
    console.log(`… build ${buildNumber}: ${state}`);
    await sleep(60_000);
  }
}

async function accountHolder() {
  const res = await api("GET", "/v1/users?filter[roles]=ACCOUNT_HOLDER&limit=1").catch((e) => (e.status === 403 ? null : Promise.reject(e)));
  return res?.data[0]?.attributes ?? null;
}

async function groups() {
  return (await api("GET", `/v1/apps/${appId}/betaGroups?limit=50`)).data;
}

async function status() {
  const app = (await api("GET", `/v1/apps/${appId}`)).data.attributes;
  console.log(`app ${appId}: ${app.name} (${app.bundleId})`);
  for (const g of await groups()) {
    const a = g.attributes;
    console.log(`group "${a.name}": ${a.isInternalGroup ? "internal" : "external"}${a.hasAccessToAllBuilds ? ", every build" : ""}${a.publicLinkEnabled ? `, public link ${a.publicLink ?? "(pending)"}` : ""}`);
  }
  if (!buildNumber) return;
  const found = await findBuild();
  if (!found) return console.log(`build ${buildNumber}: not in App Store Connect yet`);
  const d = found.detail?.attributes ?? {};
  console.log(`build ${buildNumber}: ${found.build.attributes.processingState}, encryption ${found.build.attributes.usesNonExemptEncryption}, internal ${d.internalBuildState}, external ${d.externalBuildState}`);
}

/** The build's "What to Test" in LOCALE: patched if it exists, else created. */
async function whatToTest(buildId, whatsNew) {
  const existing = (await api("GET", `/v1/builds/${buildId}/betaBuildLocalizations`)).data.find((l) => l.attributes.locale === LOCALE);
  if (existing) return api("PATCH", `/v1/betaBuildLocalizations/${existing.id}`, { data: { type: "betaBuildLocalizations", id: existing.id, attributes: { whatsNew } } });
  return api("POST", "/v1/betaBuildLocalizations", { data: { type: "betaBuildLocalizations", attributes: { locale: LOCALE, whatsNew }, relationships: { build: rel("builds", buildId) } } });
}

async function ship() {
  if (!appId || !buildNumber) throw new Error("ship needs ascAppId in eas.json (or --app) and --build-number");
  const { build } = await waitForBuild();
  console.log(`✓ build ${buildNumber} processed (${build.id})`);
  if (build.attributes.usesNonExemptEncryption == null) {
    await api("PATCH", `/v1/builds/${build.id}`, { data: { type: "builds", id: build.id, attributes: { usesNonExemptEncryption: false } } });
    console.log("✓ export compliance: no non-exempt encryption");
  }

  const holder = await accountHolder();
  const tf = listing.testflight;
  await whatToTest(build.id, tf.whatToTest);
  console.log("✓ What to Test");
  const appLoc = (await api("GET", `/v1/apps/${appId}/betaAppLocalizations`)).data.find((l) => l.attributes.locale === LOCALE);
  const feedbackEmail = appLoc?.attributes.feedbackEmail ?? holder?.username ?? null;
  const testInfo = { description: tf.description, privacyPolicyUrl: listing.privacyPolicy, marketingUrl: listing.website, ...(feedbackEmail ? { feedbackEmail } : {}) };
  if (appLoc) await api("PATCH", `/v1/betaAppLocalizations/${appLoc.id}`, { data: { type: "betaAppLocalizations", id: appLoc.id, attributes: testInfo } });
  else await api("POST", "/v1/betaAppLocalizations", { data: { type: "betaAppLocalizations", attributes: { locale: LOCALE, ...testInfo }, relationships: { app: rel("apps", appId) } } });
  console.log(`✓ test information (feedback email ${feedbackEmail ? "set" : "missing"})`);
  const review = (await api("GET", `/v1/apps/${appId}/betaAppReviewDetail`)).data;
  const r = review.attributes;
  const contact = {
    ...(r.contactEmail ? {} : holder?.username ? { contactEmail: holder.username } : {}),
    ...(r.contactFirstName ? {} : holder?.firstName ? { contactFirstName: holder.firstName } : {}),
    ...(r.contactLastName ? {} : holder?.lastName ? { contactLastName: holder.lastName } : {}),
  };
  await api("PATCH", `/v1/betaAppReviewDetails/${review.id}`, { data: { type: "betaAppReviewDetails", id: review.id, attributes: { ...contact, notes: tf.reviewNotes, demoAccountRequired: false } } });
  const after = { ...r, ...contact };
  const missing = ["contactFirstName", "contactLastName", "contactEmail", "contactPhone"].filter((k) => !after[k]);
  console.log(`✓ beta review notes${missing.length ? `; review contact missing: ${missing.join(", ")}` : ""}`);

  let all = await groups();
  let internal = all.find((g) => g.attributes.isInternalGroup);
  if (!internal) {
    internal = (await api("POST", "/v1/betaGroups", { data: { type: "betaGroups", attributes: { name: "Team", isInternalGroup: true, hasAccessToAllBuilds: true }, relationships: { app: rel("apps", appId) } } })).data;
    console.log('✓ internal group "Team" created');
  }
  if (!internal.attributes.hasAccessToAllBuilds) await api("POST", `/v1/betaGroups/${internal.id}/relationships/builds`, { data: [{ type: "builds", id: build.id }] });
  if (holder) {
    const testers = (await api("GET", `/v1/betaGroups/${internal.id}/betaTesters?limit=200`)).data;
    if (!testers.some((t) => t.attributes.email?.toLowerCase() === holder.username.toLowerCase())) {
      await api("POST", "/v1/betaTesters", { data: { type: "betaTesters", attributes: { email: holder.username, firstName: holder.firstName, lastName: holder.lastName }, relationships: { betaGroups: { data: [{ type: "betaGroups", id: internal.id }] } } } });
    }
    console.log(`✓ internal group "${internal.attributes.name}" has the account holder`);
  } else console.log(`! internal group "${internal.attributes.name}": the API key can't read users; add the owner by hand`);

  let pub = all.find((g) => !g.attributes.isInternalGroup && g.attributes.name === PUBLIC_GROUP);
  if (!pub) {
    pub = (await api("POST", "/v1/betaGroups", { data: { type: "betaGroups", attributes: { name: PUBLIC_GROUP, publicLinkEnabled: true, publicLinkLimitEnabled: false, feedbackEnabled: true }, relationships: { app: rel("apps", appId) } } })).data;
    console.log(`✓ external group "${PUBLIC_GROUP}" created`);
  } else if (!pub.attributes.publicLinkEnabled) {
    pub = (await api("PATCH", `/v1/betaGroups/${pub.id}`, { data: { type: "betaGroups", id: pub.id, attributes: { publicLinkEnabled: true, publicLinkLimitEnabled: false } } })).data;
  }
  const inPublic = (await api("GET", `/v1/betaGroups/${pub.id}/builds?limit=200`)).data.some((b) => b.id === build.id);
  if (!inPublic) await api("POST", `/v1/betaGroups/${pub.id}/relationships/builds`, { data: [{ type: "builds", id: build.id }] });
  console.log(`✓ build ${buildNumber} in "${PUBLIC_GROUP}"`);

  const detail = (await findBuild()).detail.attributes;
  if (["READY_FOR_BETA_SUBMISSION", "MISSING_EXPORT_COMPLIANCE", "BETA_REJECTED"].includes(detail.externalBuildState)) {
    await api("POST", "/v1/betaAppReviewSubmissions", { data: { type: "betaAppReviewSubmissions", relationships: { build: rel("builds", build.id) } } });
    console.log("✓ submitted for beta app review");
  } else console.log(`✓ beta app review: ${detail.externalBuildState}`);
  all = await groups();
  pub = all.find((g) => g.id === pub.id);
  console.log(`public link: ${pub.attributes.publicLink ?? "(not issued yet)"}`);
}

const commands = { status, ship };
if (!commands[command] || !appId) {
  console.error(!appId ? "no ascAppId in eas.json (or --app)" : `usage: testflight.mjs ${Object.keys(commands).join(" | ")}`);
  process.exit(2);
}
try {
  await commands[command]();
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
