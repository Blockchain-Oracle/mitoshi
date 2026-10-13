// The Mitoshi mark (web/src/components/shell/MitoshiMark.tsx: a horizon, the path rising over it, one vermilion point)
// in Owarine 90a91d71:docs-site/components/brand.tsx's lockup (D-227).
export function Mark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 266 322" className={className} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M36 262 H230" stroke="currentColor" fill="none" strokeWidth="30" strokeLinecap="round" />
      <path d="M52 214 C 104 214, 132 142, 190 108" stroke="currentColor" fill="none" strokeWidth="30" strokeLinecap="round" />
      <circle cx="206" cy="88" r="30" style={{ fill: 'var(--brand)' }} />
    </svg>
  );
}
export function Brand({ docs = false, small = false }: { docs?: boolean; small?: boolean }) {
  return (
    <span className={`brand ${small ? 'brand-small' : ''}`}>
      <Mark /><span>Mitoshi</span>
      {docs && <><span className="brand-kanji" lang="ja">見通し</span><i /><span className="brand-docs">Docs</span></>}
    </span>
  );
}
