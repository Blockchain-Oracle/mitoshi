// Ported from Owarine 90a91d71:docs-site/app/opengraph-image.tsx (D-227): the share image, rendered at build time with
// the Mitoshi mark's own geometry (web/src/components/shell/MitoshiMark.tsx) on the dark ground.
import { ImageResponse } from 'next/og';

export const alt = 'Mitoshi Docs — prediction markets and stocks on Tempo';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const INK = '#FFFFFF';
const MUTED = '#A3A3A3';
const LINE = '#262626';
const VERMILION = '#E04D26';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#050505', color: INK, padding: '52px 64px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingBottom: 32, borderBottom: `1px solid ${LINE}` }}>
        <span style={{ color: VERMILION, fontSize: 18, letterSpacing: 3 }}>THE MITOSHI GUIDES</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <svg width="34" height="41" viewBox="0 0 266 322" xmlns="http://www.w3.org/2000/svg">
            <path d="M36 262 H230" stroke={INK} fill="none" strokeWidth="30" strokeLinecap="round" />
            <path d="M52 214 C 104 214, 132 142, 190 108" stroke={INK} fill="none" strokeWidth="30" strokeLinecap="round" />
            <circle cx="206" cy="88" r="30" fill={VERMILION} />
          </svg>
          <span style={{ fontSize: 30, fontWeight: 700 }}>Mitoshi</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 52 }}>
        <span style={{ fontSize: 74, fontWeight: 700, letterSpacing: -3, lineHeight: 1.08 }}>See where it&apos;s going.</span>
        <span style={{ fontSize: 74, fontWeight: 700, letterSpacing: -3, lineHeight: 1.08, color: VERMILION }}>Read how it settles.</span>
        <span style={{ fontSize: 25, lineHeight: 1.5, color: MUTED, marginTop: 24 }}>Prediction markets and stocks on Tempo, explained step by step.</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 28, borderTop: `1px solid ${LINE}` }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {['Make a call', 'Windows and prints', 'The architecture'].map((label) => <span key={label} style={{ display: 'flex', fontSize: 18, border: `1px solid ${LINE}`, borderRadius: 24, padding: '10px 20px', background: '#0A0A0A' }}>{label}</span>)}
        </div>
        <span style={{ color: MUTED, fontSize: 18 }}>Tempo testnet</span>
      </div>
    </div>,
    size,
  );
}
