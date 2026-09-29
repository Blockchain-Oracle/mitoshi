// Ported from Masayume 68f7a09:web/src/components/shell/GrainOverlay.tsx — film grain, dropped on coarse pointers and
// in the app by `styles/shell-fixes.css` (R4: a full-screen blend layer costs phones their frame budget).
export default function GrainOverlay() {
  return <div className="grain" aria-hidden="true" />;
}
