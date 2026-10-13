#!/usr/bin/env node
/**
 * Google Play through the Play Developer API (androidpublisher v3, D-227, MOBILE), as the service account eas.json's
 * Android submit names. Every change runs in one edit and is committed at the end; a refused commit prints Google's
 * reason and leaves the live app as it was.
 *
 *   node mobile/scripts/play.mjs status                         # tracks, releases, listing and image counts (no commit)
 *   node mobile/scripts/play.mjs listing                        # store/listing.json + store/*.png → the en-US listing
 *   node mobile/scripts/play.mjs release --track beta --version-code 7 [--name "1.0.0 (7)"]
 *                                                               # that build to a track, completed, with the release note
 *   node mobile/scripts/play.mjs testers --track alpha --group mitoshi-testers@googlegroups.com
 *
 * The package is app.identity.json's `androidPackage` (`--package` overrides). The service account's key never leaves
 * this process: it is read from disk, signs one JWT, and only the short-lived access token is sent with requests.
 */
import { createSign } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const store = resolve(mobile, "store");
const eas = JSON.parse(readFileSync(resolve(mobile, "eas.json"), "utf8"));
const identity = JSON.parse(readFileSync(resolve(mobile, "app.identity.json"), "utf8"));
const listing = JSON.parse(readFileSync(resolve(store, "listing.json"), "utf8"));

const [command, ...rest] = process.argv.slice(2);
const opt = (name) => (rest.includes(`--${name}`) ? rest[rest.indexOf(`--${name}`) + 1] : null);
const pkg = opt("package") ?? identity.androidPackage;
const keyPath = eas.submit.production.android.serviceAccountKeyPath;
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}`;
const UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${pkg}`;

async function accessToken() {
  const sa = JSON.parse(readFileSync(keyPath, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: sa.token_uri, iat: now, exp: now + 3600 })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key).toString("base64url");
  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  if (!res.ok) throw new Error(`token: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).access_token;
}

const token = await accessToken();

async function call(method, url, body, contentType = "application/json") {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": contentType } : {}) },
    body: body === undefined ? undefined : contentType === "application/json" ? JSON.stringify(body) : body,
  });
  const text = await res.text();
  if (!res.ok) {
    const error = new Error(`${method} ${url.replace(/^https:\/\/[^/]+/, "")}: HTTP ${res.status} ${text.slice(0, 1500)}`);
    error.status = res.status;
    throw error;
  }
  return text ? JSON.parse(text) : {};
}

async function withEdit(fn, { commit }) {
  const edit = await call("POST", `${API}/edits`, {});
  const base = `${API}/edits/${edit.id}`;
  try {
    const result = await fn(base, edit.id);
    if (commit) {
      await call("POST", `${base}:commit`);
      console.log(`✓ edit ${edit.id} committed`);
    } else {
      await call("DELETE", base);
    }
    return result;
  } catch (error) {
    await call("DELETE", base).catch(() => {});
    throw error;
  }
}

async function status() {
  await withEdit(
    async (base) => {
      const details = await call("GET", `${base}/details`);
      console.log(`package ${pkg}; default language ${details.defaultLanguage ?? "—"}; contact email ${details.contactEmail ? "set" : "missing"}; website ${details.contactWebsite ?? "—"}`);
      const { tracks = [] } = await call("GET", `${base}/tracks`);
      for (const t of tracks) {
        const releases = (t.releases ?? []).map((r) => `${r.name ?? "?"} [${(r.versionCodes ?? []).join(",")}] ${r.status}`).join("; ");
        console.log(`track ${t.track}: ${releases || "no release"}`);
      }
      const l = await call("GET", `${base}/listings/${listing.language}`).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
      console.log(`listing ${listing.language}: ${l ? `"${l.title}", short ${l.shortDescription?.length ?? 0} chars, full ${l.fullDescription?.length ?? 0} chars` : "none"}`);
      for (const type of ["icon", "featureGraphic", "phoneScreenshots"]) {
        const { images = [] } = await call("GET", `${base}/listings/${listing.language}/${type}`);
        console.log(`images ${type}: ${images.length}`);
      }
      const { bundles = [] } = await call("GET", `${base}/bundles`);
      console.log(`bundles: ${bundles.map((b) => b.versionCode).join(", ") || "none"}`);
    },
    { commit: false },
  );
}

async function upload(base, type, file) {
  const bytes = readFileSync(file);
  await call("POST", `${UPLOAD}/edits/${base.split("/edits/")[1]}/listings/${listing.language}/${type}?uploadType=media`, bytes, "image/png");
}

async function putListing() {
  const shots = readdirSync(resolve(store, "screenshots")).filter((f) => /^phone-\d+-.+\.png$/.test(f)).sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]));
  if (shots.length < 2 || shots.length > 8) throw new Error(`${shots.length} phone screenshots in store/screenshots (Play takes 2–8)`);
  await withEdit(
    async (base) => {
      const details = await call("GET", `${base}/details`);
      await call("PATCH", `${base}/details`, { defaultLanguage: details.defaultLanguage ?? listing.language, contactWebsite: listing.website, ...(details.contactEmail ? {} : opt("email") ? { contactEmail: opt("email") } : {}) });
      await call("PUT", `${base}/listings/${listing.language}`, { language: listing.language, title: listing.title, shortDescription: listing.shortDescription, fullDescription: listing.fullDescription });
      console.log(`✓ listing text (${listing.language})`);
      for (const [type, files] of [["icon", ["icon-512.png"]], ["featureGraphic", ["feature-graphic.png"]], ["phoneScreenshots", shots.map((s) => `screenshots/${s}`)]]) {
        await call("DELETE", `${base}/listings/${listing.language}/${type}`);
        for (const f of files) await upload(base, type, resolve(store, f));
        console.log(`✓ ${type}: ${files.length}`);
      }
    },
    { commit: true },
  );
}

async function release() {
  const track = opt("track");
  const versionCode = opt("version-code");
  if (!track || !versionCode) throw new Error("release needs --track and --version-code");
  await withEdit(
    async (base) => {
      const body = {
        track,
        releases: [{ name: opt("name") ?? undefined, versionCodes: [String(versionCode)], status: "completed", releaseNotes: [{ language: listing.language, text: listing.releaseNotes }] }],
      };
      const t = await call("PUT", `${base}/tracks/${track}`, body);
      console.log(`✓ track ${t.track}: [${t.releases.map((r) => r.versionCodes.join(",")).join("; ")}] ${t.releases.map((r) => r.status).join(", ")}`);
    },
    { commit: true },
  );
}

async function testers() {
  const track = opt("track");
  const group = opt("group");
  if (!track || !group) throw new Error("testers needs --track and --group");
  await withEdit(async (base) => console.log(await call("PUT", `${base}/testers/${track}`, { googleGroups: [group] })), { commit: true });
}

const commands = { status, listing: putListing, release, testers };
if (!commands[command]) {
  console.error(`usage: play.mjs ${Object.keys(commands).join(" | ")}`);
  process.exit(2);
}
try {
  await commands[command]();
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
