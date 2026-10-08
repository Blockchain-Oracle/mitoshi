import { describe, expect, it } from "vitest";
import { WALLET_WATCH, walletStep, type WalletWatch } from "./useWalletToasts";

const A = "0x00000000000000000000000000000000000000aa";
const B = "0x00000000000000000000000000000000000000bb";
type Seen = { address: string | null; isConnecting: boolean };
const walk = (steps: Seen[]) => {
  let w: WalletWatch = WALLET_WATCH;
  return steps.map((s) => {
    const r = walletStep(w, s);
    w = r.next;
    return r.toast;
  });
};

describe("wallet toasts (RV-92)", () => {
  it("stays quiet while a remembered session restores on load", () => {
    expect(walk([{ address: null, isConnecting: false }, { address: null, isConnecting: true }, { address: A, isConnecting: false }])).toEqual([null, null, null]);
  });
  it("says connected on a sign-in and disconnected on a sign-out, once each", () => {
    expect(walk([{ address: null, isConnecting: true }, { address: null, isConnecting: false }, { address: A, isConnecting: false }, { address: A, isConnecting: false }, { address: null, isConnecting: false }])).toEqual([null, null, "connected", null, "disconnected"]);
  });
  it("names a switch to another account as a connection", () => {
    expect(walk([{ address: null, isConnecting: true }, { address: A, isConnecting: false }, { address: B, isConnecting: false }])).toEqual([null, null, "connected"]);
  });
});
