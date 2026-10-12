'use client';
// Ported from Owarine 90a91d71:docs-site/components/guide-capture.tsx (D-227), without annotations: a dated capture of
// the deployed product with its state and date, never a mock-up. The registry is `lib/captures.ts`.
import { Brand } from './brand';
import { captures, type CaptureName } from '@/lib/captures';

export function GuideCapture({ name, caption }: { name: CaptureName; caption?: string }) {
  const capture = captures[name];
  const phone = capture.width < 600;
  return (
    <figure className="guide-shot not-prose">
      <div className="guide-top"><span>{capture.title}</span><Brand small /></div>
      <a className={`guide-capture${phone ? ' is-phone' : ''}`} href={`/captures/${capture.file}`} target="_blank" rel="noreferrer" aria-label={`Open the original capture: ${capture.title}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the original capture, unmodified */}
        <img src={`/captures/${capture.file}`} alt={capture.alt} loading="lazy" width={capture.width} height={capture.height} />
      </a>
      <figcaption>
        {caption && <p>{caption}</p>}
        <div className="guide-capture-meta">
          <p><strong>State:</strong> {capture.state}</p>
          <p className="guide-capture-date">Captured {capture.date} from the deployed testnet product.</p>
        </div>
      </figcaption>
    </figure>
  );
}
