// The Mitoshi mark: 見通し — "the view ahead". Masayume's drawing grammar kept exactly (68f7a09
// web/src/components/shell/MasayumeMark.tsx: the 266×322 footprint the shell CSS sizes against, rounded caps, the
// figure on currentColor, exactly one vermilion accent) with Mitoshi's own figure: a horizon line and the path that
// rises over it to the point you can see coming.
export default function MitoshiMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 266 322" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} xmlns="http://www.w3.org/2000/svg">
      {title ? <title>{title}</title> : null}
      <path d="M36 262 H230" stroke="currentColor" fill="none" strokeWidth="30" strokeLinecap="round" />
      <path d="M52 214 C 104 214, 132 142, 190 108" stroke="currentColor" fill="none" strokeWidth="30" strokeLinecap="round" />
      <circle cx="206" cy="88" r="30" style={{ fill: "var(--vermilion)" }} />
    </svg>
  );
}
