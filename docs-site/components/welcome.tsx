// Ported from Owarine 90a91d71:docs-site/components/welcome.tsx (D-227): the home's actions, its map of the product
// and its journeys, in Mitoshi's places.
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, CandlestickChart, ChevronRight, Layers3, Network, Sparkles } from 'lucide-react';
import { Brand } from './brand';
import { appUrl } from '@/lib/site';
import mapStyles from './product-map.module.css';

export function AppLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={appUrl(href)} target="_blank" rel="noreferrer">{children}<ArrowUpRight size={13} className="inline-icon" /></a>;
}
export function WelcomeActions() {
  return (
    <div className="welcome-actions not-prose">
      <Link href="/start/quickstart" className="primary-link">Start here <ArrowRight size={17} /></Link>
      <Link href="/architecture/overview" className="secondary-link">How it works</Link>
    </div>
  );
}
const journeys = [
  { label: 'Trade', title: 'Make your first call', description: 'Sign up with a passkey, take testnet dollars and tap UP or DOWN on a live Window.', href: '/start/quickstart', icon: CandlestickChart },
  { label: 'Automate', title: 'Copy a strategy or an agent', description: 'One transaction to copy, one to stop, with caps the vault enforces.', href: '/automate/overview', icon: Sparkles },
  { label: 'Stocks', title: 'See stocks on Tempo', description: 'Stock Windows today; bridged Robinhood Stock Tokens, pools and reserves.', href: '/stocks/overview', icon: Layers3 },
  { label: 'Architecture', title: 'See how it fits together', description: 'The engine, the signed prints, the keepers, the indexer and the relay.', href: '/architecture/overview', icon: Network },
];
export function JourneyList() {
  return (
    <div className="journey-list not-prose">
      {journeys.map(({ icon: Icon, label: _label, ...j }) => (
        <Link key={j.href} href={j.href} className="journey-row">
          <span className="journey-icon"><Icon size={22} /></span>
          <span><strong>{j.title}</strong><span className="journey-description">{j.description}</span></span>
          <ChevronRight size={19} />
        </Link>
      ))}
    </div>
  );
}
export function ProductMap() {
  return (
    <div className={`product-map not-prose ${mapStyles.root}`}>
      <div className={`asset-brand ${mapStyles.brand}`}><Brand small /></div>
      <nav className={`map-paths ${mapStyles.paths}`} aria-label="Explore Mitoshi">
        {journeys.map(({ icon: Icon, ...journey }) => (
          <Link href={journey.href} key={journey.href} className={mapStyles.journey}>
            <span className={`map-icon ${mapStyles.icon}`}><Icon size={28} aria-hidden="true" /></span>
            <strong>{journey.label}</strong>
          </Link>
        ))}
      </nav>
      <div className={`map-connector ${mapStyles.connector}`} aria-hidden="true" />
      <Link className={`map-foundation ${mapStyles.foundation}`} href="/help/availability">
        <span className={mapStyles.foundationLabel}>Runs on Tempo testnet</span>
        <span className={mapStyles.foundationParts}>
          <span>Testnet dollars <b aria-hidden="true">·</b> real books and settlement</span>
          <span>Mainnet: planned, not deployed</span>
        </span>
        <ArrowRight size={18} className={mapStyles.foundationArrow} aria-hidden="true" />
      </Link>
    </div>
  );
}
