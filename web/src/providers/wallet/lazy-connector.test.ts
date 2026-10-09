import { describe, expect, it, vi } from "vitest";
import { createConnector, type CreateConnectorFn } from "wagmi";
import { lazyConnector } from "./lazy-connector";

const ACCOUNT = "0x00000000000000000000000000000000000000a1" as const;

/** A stand-in for `tempoWallet()` that records when it is built (its real setup mounts the wallet.tempo.xyz iframe). */
function probe() {
  const built = vi.fn();
  const fn: CreateConnectorFn = createConnector((config) => {
    built();
    return {
      id: "xyz.tempo", name: "Tempo Wallet", type: "injected",
      async connect() {
        config.emitter.emit("connect", { accounts: [ACCOUNT], chainId: 42431 });
        return { accounts: [ACCOUNT], chainId: 42431 } as never;
      },
      async disconnect() {},
      async getAccounts() { return [ACCOUNT]; },
      async getChainId() { return 42431; },
      async getProvider() { return {}; },
      async isAuthorized() { return true; },
      onAccountsChanged() {},
      onChainChanged() {},
      onDisconnect() {},
    };
  });
  return { built, fn };
}

function config(recent: string | null) {
  const emitted: string[] = [];
  const emitter = { uid: "u", emit: (e: string) => emitted.push(e), on: () => undefined, once: () => undefined, off: () => undefined, listenerCount: () => 0 };
  const storage = { key: "wagmi", getItem: async (k: string) => (k === "recentConnectorId" ? recent : null), setItem: async () => undefined, removeItem: async () => undefined };
  return { emitted, cfg: { chains: [{ id: 42431 }], emitter, providers: [], storage } as never };
}

describe("lazyConnector (D-152)", () => {
  it("is only an id, a name and a type until it is used", async () => {
    const { built, fn } = probe();
    const { cfg } = config(null);
    const c = lazyConnector({ id: "xyz.tempo", name: "Tempo Wallet", type: "injected" }, () => fn)(cfg);
    expect([c.id, c.name, c.type]).toEqual(["xyz.tempo", "Tempo Wallet", "injected"]);
    // wagmi's reconnect asks every connector for its provider, then whether it is authorised (reconnect.js): one the
    // user did not use last answers with no provider and stays unbuilt.
    expect(await c.getProvider()).toBeUndefined();
    expect(await c.isAuthorized()).toBe(false);
    expect(built).not.toHaveBeenCalled();
  });

  it("builds from an async loader (a store of its own) on first use", async () => {
    const { built, fn } = probe();
    const { cfg } = config(null);
    const c = lazyConnector({ id: "xyz.tempo", name: "Tempo Wallet", type: "injected" }, async () => fn)(cfg);
    expect(await c.connect()).toEqual({ accounts: [ACCOUNT], chainId: 42431 });
    expect(await c.getProvider()).toEqual({});
    expect(built).toHaveBeenCalledTimes(1);
  });

  it("builds the real connector on connect, once, on wagmi's own emitter", async () => {
    const { built, fn } = probe();
    const { cfg, emitted } = config(null);
    const c = lazyConnector({ id: "xyz.tempo", name: "Tempo Wallet", type: "injected" }, () => fn)(cfg);
    expect(await c.connect()).toEqual({ accounts: [ACCOUNT], chainId: 42431 });
    expect(await c.getAccounts()).toEqual([ACCOUNT]);
    expect(built).toHaveBeenCalledTimes(1);
    expect(emitted).toEqual(["connect"]);
  });

  it("restores the last-used connector on reconnect", async () => {
    const { built, fn } = probe();
    const { cfg } = config("xyz.tempo");
    const c = lazyConnector({ id: "xyz.tempo", name: "Tempo Wallet", type: "injected" }, () => fn)(cfg);
    expect(await c.isAuthorized()).toBe(true);
    expect(built).toHaveBeenCalledTimes(1);
  });
});
