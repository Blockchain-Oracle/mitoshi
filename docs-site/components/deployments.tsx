// Every address Mitoshi deployed, read from `lib/deployments.json` — a copy of the repository's deployment fragments
// that `pnpm check:content` keeps equal to them (D-227). Grouped by area, each linked to its explorer.
import deployments from '@/lib/deployments.json';
import { ArrowUpRight } from 'lucide-react';

type Contract = { address: string; deployBlock: number | null; txHash: string | null; history: { address: string; retiredAtUtc: string | null }[] };
type Area = { commit: string | null; deployedAtUtc: string | null; contracts: Record<string, Contract>; pools?: Record<string, { mirror: string; poolId: string; fee: number | null; status: string; positions: number }> };
type Chain = { name: string; areas: Record<string, Area> };

const CHAINS = deployments as unknown as Record<string, Chain>;
const EXPLORER: Record<string, string> = { '42431': 'https://explore.testnet.tempo.xyz' };

/** What each area is, in the order a reader meets it. */
const AREAS: Record<string, string> = {
  engine: 'The market engine: books, Windows, prints and their verifiers',
  fair: 'The fair-value guard Range, Moonshot, Parlay, Boost and exits price against',
  vault2: 'The Trading Balance (EventVaultV2)',
  vault: 'The first Trading Balance (EventVault), still withdrawable',
  maker: 'The maker vault (Earn)',
  range: 'Range and Moonshot (house reserve)',
  parlay: 'Parlay (house reserve)',
  leverage: 'Boost (house reserve)',
  private: 'The private desk',
  strategies: 'Strategies and agents',
  stocks: 'Stock mirrors, their views and the sync receiver',
  guard: 'The stock pools’ price guard',
  v4: 'Uniswap v4, replayed from Tempo mainnet',
  themes: 'Themes',
  launch: 'Launchpads',
};

const short = (v: string) => `${v.slice(0, 8)}…${v.slice(-6)}`;

export function Deployments({ chain = '42431', areas }: { chain?: string; areas?: string[] }) {
  const data = CHAINS[chain];
  if (!data) return null;
  const order = (areas ?? Object.keys(AREAS)).filter(a => data.areas[a] && Object.keys(data.areas[a].contracts).length > 0);
  const base = EXPLORER[chain];
  return (
    <div className="not-prose">
      {order.map(area => {
        const a = data.areas[area];
        return (
          <section key={area} className="ledger" aria-label={AREAS[area] ?? area}>
            <header><span>{AREAS[area] ?? area}</span><small>{area} · commit {a.commit ?? '—'}{a.deployedAtUtc ? ` · ${a.deployedAtUtc.slice(0, 10)}` : ''}</small></header>
            {Object.entries(a.contracts).map(([name, c]) => (
              <div className="ledger-row" key={name}>
                <span><b>{name}</b>{c.deployBlock ? <small>block {c.deployBlock.toLocaleString('en-US')}</small> : null}{c.history.length ? <small>replaced: {c.history.map(h => short(h.address)).join(', ')}</small> : null}</span>
                <a href={`${base}/address/${c.address}`} target="_blank" rel="noreferrer" title={c.address}>{c.address}<ArrowUpRight size={12} className="inline-icon" /></a>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

export function StockPools() {
  const pools = CHAINS['42431']?.areas.pools?.pools ?? {};
  return (
    <section className="ledger not-prose" aria-label="Stock pools on Uniswap v4">
      <header><span>pathUSD pools on Uniswap v4, behind the price guard</span><small>pools · {CHAINS['42431']?.areas.pools?.commit ?? '—'}</small></header>
      {Object.entries(pools).map(([ticker, p]) => (
        <div className="ledger-row" key={ticker}>
          <span><b>{ticker}</b><small>{p.status === 'initialized' ? `initialized · ${p.positions} house positions · fee ${(p.fee ?? 0) / 10_000} %` : 'registered, not initialized'}</small></span>
          <span><code title={p.poolId}>{short(p.poolId)}</code></span>
        </div>
      ))}
    </section>
  );
}
