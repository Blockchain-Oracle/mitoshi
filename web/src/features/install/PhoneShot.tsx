// Ported from Masayume 68f7a09:web/src/features/install/PhoneShot.tsx
import { INSTALL } from "./copy";

/**
 * The app itself, captured on a phone — the reference's `PhoneShot`, frame markup kept exactly.
 *
 * The reference argues for a real capture over a drawing: a drawing shows the app as intended
 * rather than as built. So this is a real capture of `/markets` at a phone viewport, straight off
 * the browser, at `public/app/bet-screen.png` (780×1688 — a 390×844 viewport at 2×, the same
 * 1:2.164 a phone screen has). TO REPLACE: capture again at that viewport and drop it in.
 *
 * One addition, `dl-phone-bar`: a browser capture has no status bar, where a device shot does,
 * so the frame supplies that band above the image and the island sits in a real gap as the
 * reference's comment describes. The band is frame, not app.
 */
export function PhoneShot() {
  return (
    <div className="dl-phone">
      {/* The side controls. Three nubs on the left, one on the right, in the real proportions
          and positions. They are what the eye actually uses to tell a phone from a rounded
          rectangle, more than the corner radius does. */}
      <span className="dl-phone-btn dl-btn-mute" aria-hidden="true" />
      <span className="dl-phone-btn dl-btn-volup" aria-hidden="true" />
      <span className="dl-phone-btn dl-btn-voldn" aria-hidden="true" />
      <span className="dl-phone-btn dl-btn-power" aria-hidden="true" />

      <div className="dl-phone-screen">
        <div className="dl-phone-bar" aria-hidden="true" />
        {/* Intrinsic size of the asset: wrong values here reserve the wrong box and the page jumps when the image lands. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/app/phone-home.png" alt={INSTALL.shotAlt} width={780} height={1688} />
        <span className="dl-phone-island" aria-hidden="true" />
      </div>
    </div>
  );
}
