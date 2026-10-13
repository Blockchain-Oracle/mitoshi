// The welcome's pictures (round 7): each scene is the product's own moment drawn in its own marks — the live line and
// UP/DOWN, the tap and its receipt, the signed verdict, the passkey, the test dollars — not stock art. Pure SVG, coloured
// by CSS (styles/welcome.css), animated by CSS keyframes that restart when a scene mounts (reduced motion: still).
import { faucetDollars } from "@/features/funding/resume";
import type { SceneKey } from "./copy";

function CallArt() {
  return (
    <svg viewBox="0 0 320 240" className="wl-art" aria-hidden>
      <line x1="16" y1="132" x2="304" y2="132" className="wl-line-ref" />
      <path d="M16 170 C 60 160, 80 120, 116 128 S 170 168, 204 120 S 262 70, 296 78" className="wl-line wl-draw" />
      <circle cx="296" cy="78" r="6" className="wl-dot wl-pop" />
      <g className="wl-rise">
        <rect x="40" y="196" width="112" height="36" rx="18" className="wl-pill-up" />
        <text x="96" y="219" className="wl-pill-text wl-up-text">UP</text>
        <rect x="168" y="196" width="112" height="36" rx="18" className="wl-pill-down" />
        <text x="224" y="219" className="wl-pill-text wl-down-text">DOWN</text>
      </g>
    </svg>
  );
}

function TapArt() {
  return (
    <svg viewBox="0 0 320 240" className="wl-art" aria-hidden>
      <rect x="60" y="72" width="200" height="64" rx="32" className="wl-pill-up wl-press" />
      <text x="160" y="112" className="wl-pill-text wl-up-text wl-big">UP</text>
      <circle cx="160" cy="104" r="12" className="wl-ripple" />
      <g className="wl-receipt">
        <rect x="70" y="164" width="180" height="44" rx="12" className="wl-card" />
        <circle cx="94" cy="186" r="8" className="wl-ok" />
        <text x="112" y="191" className="wl-card-text">Filled · $5 UP</text>
      </g>
    </svg>
  );
}

function ProofArt() {
  return (
    <svg viewBox="0 0 320 240" className="wl-art" aria-hidden>
      <rect x="56" y="40" width="208" height="150" rx="16" className="wl-card" />
      <text x="80" y="76" className="wl-mono">BTC 5m · CLOSE</text>
      <text x="80" y="110" className="wl-figure">$83,313.23</text>
      <text x="80" y="140" className="wl-mono wl-muted">5 RedStone signers</text>
      <g className="wl-stamp">
        <rect x="170" y="150" width="112" height="44" rx="10" className="wl-stamp-box" />
        <text x="226" y="179" className="wl-stamp-text">UP WON</text>
      </g>
    </svg>
  );
}

function KeyArt() {
  return (
    <svg viewBox="0 0 320 240" className="wl-art" aria-hidden>
      <g className="wl-face">
        <path d="M120 64 h-16 a16 16 0 0 0 -16 16 v16 M200 64 h16 a16 16 0 0 1 16 16 v16 M120 176 h-16 a16 16 0 0 1 -16 -16 v-16 M200 176 h16 a16 16 0 0 0 16 -16 v-16" className="wl-frame" />
        <line x1="136" y1="98" x2="136" y2="110" className="wl-feature" />
        <line x1="184" y1="98" x2="184" y2="110" className="wl-feature" />
        <path d="M160 100 v22 h-6" className="wl-feature" />
        <path d="M138 138 q22 16 44 0" className="wl-feature" />
      </g>
      <text x="160" y="214" className="wl-mono wl-center wl-muted">mitoshi.xyz · passkey</text>
    </svg>
  );
}

function DollarsArt() {
  return (
    <svg viewBox="0 0 320 240" className="wl-art" aria-hidden>
      <rect x="64" y="64" width="192" height="112" rx="16" className="wl-card" />
      <rect x="84" y="84" width="58" height="22" rx="11" className="wl-plate" />
      <text x="113" y="100" className="wl-plate-text">TEST</text>
      <text x="160" y="148" className="wl-figure wl-center wl-count">{faucetDollars()}</text>
      <circle cx="232" cy="96" r="6" className="wl-dot wl-pop" />
    </svg>
  );
}

const ART: Record<SceneKey, () => React.JSX.Element> = { call: CallArt, tap: TapArt, proof: ProofArt, key: KeyArt, dollars: DollarsArt };

export function SceneArt({ scene }: { scene: SceneKey }) {
  const Art = ART[scene];
  return <Art />;
}
