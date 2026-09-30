/**
 * A connector that is built on first use (D-152). The Tempo Wallet connector (`wagmi/tempo` `tempoWallet`, accounts
 * 0.18.4 `dialog` adapter) mounts its wallet.tempo.xyz iframe the moment wagmi sets it up — on every page, signed in or
 * not — and that iframe pulls ~1 MB of third-party script (Stripe, a session recorder, surveys) that Lighthouse charged
 * to /markets as 2.4–5 s of blocking time on a quiet CI host. Wrapped here, the connector is only an id, a name and an
 * icon until someone picks it in the sign-in modal or it was the last connector used (wagmi's reconnect), and then it
 * is the real connector with the same emitter, storage and chains, so its events reach wagmi unchanged.
 */
import { createConnector, type CreateConnectorFn } from "wagmi";

export function lazyConnector(meta: { id: string; name: string; icon?: string; rdns?: string; type: string }, load: () => CreateConnectorFn): CreateConnectorFn {
  return createConnector((config) => {
    type Inner = ReturnType<CreateConnectorFn>;
    let inner: Promise<Inner> | null = null;
    const real = () =>
      (inner ??= (async () => {
        const connector = load()(config);
        await connector.setup?.();
        return connector;
      })());
    const recent = async () => (await config.storage?.getItem("recentConnectorId")) === meta.id;

    return {
      ...meta,
      async connect(parameters) {
        return (await real()).connect(parameters as never) as never;
      },
      async disconnect() {
        if (inner) await (await inner).disconnect();
      },
      async getAccounts() {
        return (await real()).getAccounts();
      },
      async getChainId() {
        return (await real()).getChainId();
      },
      async getProvider(parameters) {
        return (await real()).getProvider(parameters);
      },
      async getClient(parameters) {
        const c = await real();
        if (!c.getClient) throw new Error(`${meta.name}: no client`);
        return c.getClient(parameters);
      },
      // Only the connector the user last used is asked on reconnect; any other stays unbuilt.
      async isAuthorized() {
        if (!inner && !(await recent())) return false;
        return (await real()).isAuthorized();
      },
      async switchChain(parameters) {
        const c = await real();
        if (!c.switchChain) throw new Error(`${meta.name}: cannot switch chains`);
        return c.switchChain(parameters);
      },
      onAccountsChanged(accounts) {
        void real().then((c) => c.onAccountsChanged(accounts));
      },
      onChainChanged(chainId) {
        void real().then((c) => c.onChainChanged(chainId));
      },
      onDisconnect(error) {
        void real().then((c) => c.onDisconnect(error));
      },
    };
  });
}
