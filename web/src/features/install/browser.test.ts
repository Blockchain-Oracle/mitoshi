// Where each browser keeps "install" (D-230): the hint names the real menu, and a browser we can't vouch for gets no claim.
import { describe, expect, it } from "vitest";
import { installHintOf } from "./browser";

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  androidChrome: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 15; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  winChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  winEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.70",
  macSafari18: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  macSafari16: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
  macFirefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0",
  winFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  linuxFirefox: "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
  winOpera: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/116.0.0.0",
};

describe("installHintOf", () => {
  it("sends every iPhone to Safari's Share sheet and every Android to its browser menu", () => {
    expect(installHintOf(UA.iphone)).toBe("ios");
    expect(installHintOf(UA.iphoneChrome)).toBe("ios");
    expect(installHintOf(UA.androidChrome)).toBe("android");
    expect(installHintOf(UA.androidFirefox)).toBe("android");
  });
  it("names Chrome's and Edge's own menus on a computer", () => {
    expect(installHintOf(UA.macChrome)).toBe("chrome");
    expect(installHintOf(UA.winChrome)).toBe("chrome");
    expect(installHintOf(UA.winEdge)).toBe("edge");
  });
  it("names Add to Dock only where Safari has it (17 and later)", () => {
    expect(installHintOf(UA.macSafari18)).toBe("safari");
    expect(installHintOf(UA.macSafari16)).toBe("other");
  });
  it("makes no claim for Firefox, Opera or an unknown browser", () => {
    for (const ua of [UA.macFirefox, UA.winFirefox, UA.linuxFirefox, UA.winOpera, "", null, undefined]) expect(installHintOf(ua)).toBe("other");
  });
});
