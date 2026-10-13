// Where this browser keeps "install" (D-230, the owner's point 8): `/download`'s web card and the terminal's install sheet
// name the real place when the browser holds no install prompt, instead of one generic line that fits none of them.
// Read from the user agent — on the server for `/download` (so the first paint already says it) and in the browser for
// the sheet. Pure, so every browser is tested (`browser.test.ts`).
//
//   ios      iPhone, iPad or iPod: Safari's Share → Add to Home Screen (the steps in `INSTALL.iosSteps`)
//   android  any Android browser without a prompt: the browser menu → Add to Home screen
//   chrome   desktop Chrome (and the Chromium browsers that say Chrome): ⋮ → Cast, save and share → Install page as app
//   edge     desktop Edge: … → Apps → Install this site as an app
//   safari   Safari 17+ on a Mac: File → Add to Dock
//   other    anything else (Firefox, Opera, older Safari): no claim about this browser; install from Chrome, Edge or
//            Safari, or scan the code to open it on a phone

export type InstallHint = "ios" | "android" | "chrome" | "edge" | "safari" | "other";

/** Safari added "Add to Dock" in version 17 (macOS Sonoma). */
const SAFARI_DOCK = 17;

export function installHintOf(userAgent: string | null | undefined): InstallHint {
  const ua = userAgent ?? "";
  if (/\b(iPhone|iPod|iPad)\b/.test(ua)) return "ios";
  if (/\bAndroid\b/.test(ua)) return "android";
  if (/\bEdg\//.test(ua)) return "edge";
  if (/\b(OPR|Opera|Firefox|SamsungBrowser|YaBrowser)\//.test(ua)) return "other";
  if (/\b(Chrome|Chromium)\/\d/.test(ua)) return "chrome";
  const safari = /\bMacintosh\b/.test(ua) && /\bSafari\//.test(ua) ? /\bVersion\/(\d+)/.exec(ua) : null;
  return safari && Number(safari[1]) >= SAFARI_DOCK ? "safari" : "other";
}
