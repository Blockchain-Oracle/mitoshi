// /download's cards (D-230): a store without its test link says it is coming and has no button (the web app leads with
// the action); a set link becomes the store button and its QR; the device's own card leads; inside the phone app its card is
// "Installed" with nothing to press.
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import type { PlatformId, StoreRelease } from "@/lib/release";
import { platformCards } from "./cards";
import { DOWNLOAD } from "./copy";
import { InstallCta } from "./InstallCta";
import { StoreButton, type PlatformCardProps } from "./PlatformCard";

const TF = "https://testflight.apple.com/join/AbC123xy";
const OPEN = "https://play.google.com/apps/testing/xyz.mitoshi.app.testnet";
const NONE: StoreRelease = { testflight: null, play: null };
const BOTH: StoreRelease = { testflight: TF, play: { url: OPEN, track: "open" } };
const ORIGIN = "https://mitoshi.xyz";

function byId(cards: PlatformCardProps[]): Record<PlatformId, PlatformCardProps> {
  const find = (id: PlatformId) => {
    const card = cards.find((c) => c.id === id);
    if (!card) throw new Error(`no ${id} card`);
    return card;
  };
  return { ios: find("ios"), android: find("android"), web: find("web") };
}
const element = (node: unknown) => (isValidElement(node) ? (node as ReactElement<Record<string, unknown>>) : null);

describe("platformCards", () => {
  it("says each store is coming, with no button, until its link is set — the web app leads with the action", () => {
    const list = platformCards({ platform: "desktop", inApp: false, release: NONE, origin: ORIGIN });
    expect(list.map((c) => c.id)).toEqual(["web", "ios", "android"]);
    const cards = byId(list);
    expect(cards.ios.chip).toBe(DOWNLOAD.ios.pending.chip);
    expect(cards.android.chip).toBe(DOWNLOAD.android.pending.chip);
    for (const id of ["ios", "android"] as const) {
      expect(cards[id].action).toBeNull();
      expect(cards[id].qr).toBeNull();
    }
    expect(element(cards.web.action)?.type).toBe(InstallCta);
    expect(element(cards.web.action)?.props.primary).toBe(true);
    expect(cards.web.qr?.value).toBe(`${ORIGIN}/download`);
  });

  it("offers each store's own page, with its QR, once the link is set", () => {
    const cards = byId(platformCards({ platform: "desktop", inApp: false, release: BOTH, origin: ORIGIN }));
    expect(element(cards.ios.action)?.type).toBe(StoreButton);
    expect(element(cards.ios.action)?.props.href).toBe(TF);
    expect(cards.ios.qr?.value).toBe(TF);
    expect(element(cards.android.action)?.props.href).toBe(OPEN);
    expect(cards.android.chip).toBe(DOWNLOAD.android.open.chip);
  });

  it("leads a phone with the web app (its accent action) while its own store is pending", () => {
    const cards = platformCards({ platform: "ios", inApp: false, release: NONE, origin: ORIGIN });
    expect(cards.map((c) => c.id)).toEqual(["web", "ios", "android"]);
    expect(element(cards[0]?.action)?.props.primary).toBe(true);
  });

  it("leads a phone with its own store once open, as the accent action, the web app no longer the accent", () => {
    const cards = platformCards({ platform: "android", inApp: false, release: BOTH, origin: ORIGIN });
    expect(cards.map((c) => c.id)).toEqual(["android", "web", "ios"]);
    expect(element(cards[0]?.action)?.props.primary).toBe(true);
    expect(element(cards[1]?.action)?.props.primary).toBe(false);
    expect(element(cards[2]?.action)?.props.primary).toBe(false);
  });

  it("inside the phone app, marks its own card installed and offers nothing to install", () => {
    const cards = byId(platformCards({ platform: "ios", inApp: true, release: NONE, origin: ORIGIN }));
    expect(cards.ios.tone).toBe("here");
    expect(cards.ios.action).toBeNull();
    expect(cards.web.action).toBeNull();
    expect(cards.web.qr).toBeNull();
  });
});
