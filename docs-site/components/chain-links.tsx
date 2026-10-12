// A transaction or an address on Tempo testnet's explorer, shortened the way the app shortens them (D-227).
// `pnpm check:content` checks every hash against the acceptance records and every address against the deployments.
import { ArrowUpRight } from 'lucide-react';
import { addressUrl, txUrl } from '@/lib/site';

const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

export function Tx({ hash, children }: { hash: string; children?: React.ReactNode }) {
  return <a href={txUrl(hash)} target="_blank" rel="noreferrer" title={hash}><code>{children ?? short(hash)}</code><ArrowUpRight size={12} className="inline-icon" /></a>;
}
export function Address({ address, children }: { address: string; children?: React.ReactNode }) {
  return <a href={addressUrl(address)} target="_blank" rel="noreferrer" title={address}><code>{children ?? short(address)}</code><ArrowUpRight size={12} className="inline-icon" /></a>;
}
