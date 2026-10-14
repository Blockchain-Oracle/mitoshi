// /download's cards (D-230): a store no one can join yet says it is coming and has no button (the web app leads with the
// action); an open link becomes the store button and its QR; the device's own card leads; inside the phone app its card
// is "Installed" with nothing to press. A closed test shows its open-group step before the Play opt-in page.
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import type { PlatformId, StoreRelease } from "@/lib/release";
import { platformCards, waitShapes, type CardsInput } from "./cards";
import { DOWNLOAD } from "./copy";
import { InstallCta } from "./InstallCta";
import { StoreButton, type PlatformCardProps } from "./PlatformCard";

const TF = "https://testflight.apple.com/join/AbC123xy";
const OPEN = "https://play.google.com/apps/testing/xyz.mitoshi.app.testnet";
const GROUP = "https://groups.google.com/g/mitoshi-testers";
const NONE: StoreRelease = { testflight: null, play: null };
const BOTH: StoreRelease = { testflight: TF, play: OPEN };
const ORIGIN = "https://mitoshi.xyz";

const cardsFor = (input: Omit<CardsInput, "origin" | "hint"> & Partial<CardsInput>) => platformCards({ origin: ORIGIN, hint: "chrome", ...input });

function byId(cards: PlatformCardProps[]): Record<PlatformId, PlatformCardProps> {
  const find = (id: PlatformId) => {
    const card = cards.find((c) => c.id === id);
    if (!card) throw new Error(`no ${id} card`);
    return card;
  };
  return { ios: find("ios"), android: find("android"), web: find("web") };
}
const element = (node: unknown) => (isValidElement(node) ? (node as ReactElement<Record<string, unknown>>) : null);
/** The card's action is the page's accent: a store button's accent variant, or the web install marked primary. */
const accent = (card: PlatformCardProps | undefined) => {
  const action = element(card?.action);
  return action?.type === StoreButton ? action.props.variant === "accent" : action?.props.primary === true;
};

describe("platformCards", () => {
  it("says each store is coming, with no button, until its link is set — the web app leads with the action", () => {
    const list = cardsFor({ platform: "desktop", inApp: false, release: NONE });
    expect(list.map((c) => c.id)).toEqual(["web", "ios", "android"]);
    const cards = byId(list);
    expect(cards.ios.chip).toBe(DOWNLOAD.ios.pending.chip);
    expect(cards.android.chip).toBe(DOWNLOAD.android.pending.chip);
    for (const id of ["ios", "android"] as const) {
      expect(cards[id].action).toBeNull();
      expect(cards[id].qr).toBeNull();
    }
    expect(element(cards.web.action)?.type).toBe(InstallCta);
    expect(accent(cards.web)).toBe(true);
    expect(cards.web.qr?.value).toBe(`${ORIGIN}/download`);
  });

  it("hands the web install the request's own browser hint", () => {
    const cards = byId(cardsFor({ platform: "desktop", inApp: false, release: NONE, hint: "safari" }));
    expect(element(cards.web.action)?.props.hint).toBe("safari");
  });

  it("offers each store's own page, with its QR, once the link is set", () => {
    const cards = byId(cardsFor({ platform: "desktop", inApp: false, release: BOTH }));
    expect(element(cards.ios.action)?.type).toBe(StoreButton);
    expect(element(cards.ios.action)?.props.href).toBe(TF);
    expect(cards.ios.qr?.value).toBe(TF);
    expect(element(cards.android.action)?.props.href).toBe(OPEN);
    expect(cards.android.chip).toBe(DOWNLOAD.android.ready.chip);
    expect(element(cards.android.action)?.props.kicker).toBe(DOWNLOAD.android.ready.kicker);
    expect(cards.android.tone).toBe("live");
  });

  it("shows the group join step before Play for a closed test", () => {
    const release: StoreRelease = { testflight: null, play: OPEN, playGroup: GROUP };
    const card = byId(cardsFor({ platform: "android", inApp: false, release })).android;
    const children = element(card.action)?.props.children;
    expect(card.chip).toBe(DOWNLOAD.android.closed.chip);
    expect(Array.isArray(children)).toBe(true);
    if (!Array.isArray(children)) throw new Error("missing closed test steps");
    expect(element(children[0])?.props.href).toBe(GROUP);
    expect(element(children[1])?.type).toBe(StoreButton);
    expect(element(children[1])?.props.href).toBe(OPEN);
    expect(card.qr?.value).toBe(`${ORIGIN}/download#android`);
  });

  it("leads a phone with the web app (its accent action) while its own store is pending", () => {
    const cards = cardsFor({ platform: "ios", inApp: false, release: NONE });
    expect(cards.map((c) => c.id)).toEqual(["web", "ios", "android"]);
    expect(accent(cards[0])).toBe(true);
  });

  it("leads a phone with its own store once open, as the accent action, the web app no longer the accent", () => {
    const cards = cardsFor({ platform: "android", inApp: false, release: BOTH });
    expect(cards.map((c) => c.id)).toEqual(["android", "web", "ios"]);
    expect(accent(cards[0])).toBe(true);
    expect(accent(cards[1])).toBe(false);
    expect(accent(cards[2])).toBe(false);
  });

  it("never offers Play's internal test: Android says it is coming, and the web app leads with the accent", () => {
    const cards = cardsFor({ platform: "android", inApp: false, release: NONE });
    expect(cards.map((c) => c.id)).toEqual(["web", "android", "ios"]);
    expect(accent(cards[0])).toBe(true);
    expect(cards[1]?.chip).toBe(DOWNLOAD.android.pending.chip);
    expect(cards[1]?.action).toBeNull();
  });

  it("inside the phone app, marks its own card installed and offers nothing to install", () => {
    const cards = byId(cardsFor({ platform: "ios", inApp: true, release: NONE }));
    expect(cards.ios.tone).toBe("here");
    expect(cards.ios.action).toBeNull();
    expect(cards.web.action).toBeNull();
    expect(cards.web.qr).toBeNull();
  });
});

describe("waitShapes", () => {
  it("outlines today's desk: the web app's install and QR, then two stores with nothing to press", () => {
    expect(waitShapes(NONE)).toEqual([
      { id: "web", name: DOWNLOAD.web.name, chip: DOWNLOAD.web.chip, line: DOWNLOAD.web.line, action: "install", scan: DOWNLOAD.web.scan },
      { id: "ios", name: DOWNLOAD.ios.name, chip: DOWNLOAD.ios.pending.chip, line: DOWNLOAD.ios.pending.line, action: null, scan: null },
      { id: "android", name: DOWNLOAD.android.name, chip: DOWNLOAD.android.pending.chip, line: DOWNLOAD.android.pending.line, action: null, scan: null },
    ]);
  });
  it("follows Play's open test, and draws TestFlight as coming: Apple's page is read only with the request", () => {
    expect(waitShapes({ testflight: null, play: OPEN }).map((c) => [c.id, c.action, c.scan !== null])).toEqual([["android", "store", true], ["web", "install", true], ["ios", null, false]]);
    expect(waitShapes({ testflight: TF, play: null })).toEqual(waitShapes(NONE));
  });
});
