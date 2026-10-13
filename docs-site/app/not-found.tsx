// Ported from Owarine 90a91d71:docs-site/app/not-found.tsx (D-227).
import Link from 'next/link';
import { Brand } from '@/components/brand';
export default function NotFound() {
  return <main id="main-content" className="not-found"><Link href="/"><Brand docs /></Link><h1>No guide at this address.</h1><p>Start from the docs home, or search for a feature.</p><Link className="primary-link" href="/">Back to the docs</Link></main>;
}
