// /download's store links (D-230): only Apple's join links and Google Play's open test are offered (Play's internal test
// opens only for its listed testers, so it is refused), a malformed value reads as unset (the card says "Coming to …"),
// and Apple's join page is read as open only when it is the join page for that code without the closed line.
import { describe, expect, it } from "vitest";
import { orderCards, parsePlay, parseTestflight, platformOf, readStoreRelease, storeOpen, testflightState, type StoreRelease } from "./release";

const TF = "https://testflight.apple.com/join/AbC123xy";
const OPEN = "https://play.google.com/apps/testing/xyz.mitoshi.app.testnet";
const INTERNAL = "https://play.google.com/apps/internaltest/4701234567890123456";

describe("parseTestflight", () => {
  it("takes Apple's public join link", () => {
    expect(parseTestflight(` ${TF} `)).toBe(TF);
  });
  it("refuses anything else", () => {
    for (const bad of [undefined, "", "not a url", "http://testflight.apple.com/join/AbC123xy", "https://testflight.apple.com/v1/app/123", "https://evil.example/join/AbC123xy", "https://testflight.apple.com.evil.example/join/x"]) {
      expect(parseTestflight(bad)).toBeNull();
    }
  });
});

describe("parsePlay", () => {
  it("takes the open test's opt-in page or the store page", () => {
    expect(parsePlay(OPEN)).toBe(OPEN);
    expect(parsePlay("https://play.google.com/store/apps/details?id=xyz.mitoshi.app.testnet")).toBe("https://play.google.com/store/apps/details?id=xyz.mitoshi.app.testnet");
  });
  it("refuses the internal test's invitation, another host, or a broken package", () => {
    expect(parsePlay(INTERNAL)).toBeNull();
    expect(parsePlay("https://play.google.com.evil.example/apps/testing/xyz.mitoshi.app")).toBeNull();
    expect(parsePlay("https://play.google.com/apps/testing/notapackage")).toBeNull();
    expect(parsePlay("https://play.google.com/store/apps/details")).toBeNull();
  });
});

describe("testflightState", () => {
  const join = (status: string) =>
    `<div id="status"><div class="beta-status">${status}</div></div><a href="itms-beta://testflight.apple.com/join/AbC123xy">`;
  it("reads Apple's closed page, escaped as it is served, and the full one", () => {
    expect(testflightState(TF, 200, join("<span>This beta isn&#39;t accepting any new testers right now.</span>"))).toBe("closed");
    expect(testflightState(TF, 200, join("This beta isn’t accepting any new testers right now."))).toBe("closed");
    expect(testflightState(TF, 200, join("<h1>This beta is full.</h1>"))).toBe("closed");
  });
  it("takes a gone code as closed", () => {
    expect(testflightState(TF, 404, "<h2>Not Found</h2>")).toBe("closed");
  });
  it("takes the join page for this code, without the closed line, as open", () => {
    expect(testflightState(TF, 200, join("<span>Join the Mitoshi beta</span>"))).toBe("open");
  });
  it("never reads another page or a server error as open", () => {
    expect(testflightState(TF, 200, "<html><body>Something went wrong</body></html>")).toBe("unknown");
    expect(testflightState(TF, 200, join("").replace("AbC123xy", "Other999"))).toBe("unknown");
    expect(testflightState(TF, 503, join(""))).toBe("unknown");
  });
});

describe("readStoreRelease", () => {
  it("is all pending with nothing set", () => {
    expect(readStoreRelease({})).toEqual({ testflight: null, play: null });
  });
  it("reads the public TestFlight link and Play's open test, never Play's internal test", () => {
    expect(readStoreRelease({ TESTFLIGHT_PUBLIC_LINK: TF, PLAY_OPEN_TEST_LINK: OPEN })).toEqual({ testflight: TF, play: OPEN });
    expect(readStoreRelease({ PLAY_INTERNAL_TEST_LINK: INTERNAL })).toEqual({ testflight: null, play: null });
    expect(readStoreRelease({ PLAY_OPEN_TEST_LINK: INTERNAL }).play).toBeNull();
  });
});

describe("platformOf", () => {
  it("reads the phone and the app's own web view", () => {
    expect(platformOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toEqual({ platform: "ios", inApp: false });
    expect(platformOf("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36")).toEqual({ platform: "android", inApp: false });
    expect(platformOf("Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36 CWFShell/1.0.0 (android; testnet)")).toEqual({ platform: "android", inApp: true });
    expect(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15")).toEqual({ platform: "desktop", inApp: false });
    expect(platformOf(null)).toEqual({ platform: "desktop", inApp: false });
  });
});

describe("storeOpen", () => {
  it("counts a store whose link is offered", () => {
    expect(storeOpen({ testflight: TF, play: null }, "ios")).toBe(true);
    expect(storeOpen({ testflight: null, play: OPEN }, "android")).toBe(true);
    expect(storeOpen({ testflight: null, play: null }, "ios")).toBe(false);
    expect(storeOpen({ testflight: TF, play: null }, "android")).toBe(false);
  });
});

describe("orderCards", () => {
  const none: StoreRelease = { testflight: null, play: null };
  const both: StoreRelease = { testflight: TF, play: OPEN };
  it("shows a desktop the open store tests first, then the web app, then the stores still coming", () => {
    expect(orderCards("desktop", false, both)).toEqual(["ios", "android", "web"]);
    expect(orderCards("desktop", false, none)).toEqual(["web", "ios", "android"]);
    expect(orderCards("desktop", false, { testflight: null, play: OPEN })).toEqual(["android", "web", "ios"]);
    expect(orderCards("desktop", false, { testflight: TF, play: null })).toEqual(["ios", "web", "android"]);
  });
  it("leads a phone with its own app when its test is open, else with the web app", () => {
    expect(orderCards("ios", false, both)).toEqual(["ios", "web", "android"]);
    expect(orderCards("ios", false, none)).toEqual(["web", "ios", "android"]);
    expect(orderCards("android", false, both)).toEqual(["android", "web", "ios"]);
    expect(orderCards("android", false, { testflight: TF, play: null })).toEqual(["web", "android", "ios"]);
  });
  it("leads with the app itself inside its own web view", () => {
    expect(orderCards("android", true, none)).toEqual(["android", "web", "ios"]);
  });
});
