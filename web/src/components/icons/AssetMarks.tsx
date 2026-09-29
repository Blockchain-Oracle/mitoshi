// Ported from Masayume 68f7a09:web/src/components/icons/AssetMarks.tsx
/**
 * The two asset marks the reference draws, as it drew them: `components/icons/BitcoinIcon.tsx` (the orange
 * disc and the ₿ path) and the Ethereum diamond from `components/ChainIcon.tsx` L68–84. The reference
 * puts a typed "₿" on its discs because its venue lists one asset; the user's call (2026-09-04) is the
 * real vector mark on every disc, for both assets the venue lists. The fills live in `styles/icons.css`
 * — design-literals keeps hex out of TSX — and the opacities are the source's own.
 */
interface MarkProps {
  className?: string;
}

export function BitcoinMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden focusable="false">
      <circle cx="16" cy="16" r="16" className="mark-btc-disc" />
      <path
        className="mark-btc-glyph"
        d="M22.5 14.2c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.7-.4-.7 2.6c-.4-.1-.9-.2-1.3-.3l.7-2.7-1.7-.4-.7 2.7c-.4-.1-.7-.2-1-.2l-2.3-.6-.4 1.8s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.2c0 0 .1 0 .1 0l-.1 0-1.1 4.5c-.1.2-.3.5-.7.4 0 0-1.2-.3-1.2-.3l-.8 1.9 2.2.5c.4.1.8.2 1.2.3l-.7 2.8 1.7.4.7-2.7c.5.1.9.2 1.3.3l-.7 2.7 1.7.4.7-2.8c2.9.5 5.1.3 6-2.3.7-2.1 0-3.3-1.6-4.1 1.1-.3 2-1 2.2-2.6zm-3.9 5.5c-.5 2.1-4.1 1-5.3.7l.9-3.8c1.2.3 4.9.9 4.4 3.1zm.5-5.5c-.5 1.9-3.5.9-4.4.7l.8-3.4c1 .2 4.1.7 3.6 2.7z"
      />
    </svg>
  );
}

/**
 * The collateral's mark — the USDC disc (the blue ground, the broken ring, the dollar glyph), which is
 * what the venue's tUSDC is a test print of. No reference precedent: Yosuku's money pill carries a
 * generic coin glyph and its `AddFunds` no token art at all; the owner asked for the token's own logo
 * on the money surfaces (2026-09-04). Drawn as paths so it reads at 14px in the pill.
 */
export function TUsdcMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden focusable="false">
      <circle cx="16" cy="16" r="16" className="mark-usdc-disc" />
      <g className="mark-usdc-ring" strokeWidth="1.9" strokeLinecap="round">
        <path d="M12.6 25.4A10 10 0 0 1 12.6 6.6" />
        <path d="M19.4 6.6A10 10 0 0 1 19.4 25.4" />
      </g>
      <g className="mark-usdc-glyph" strokeWidth="2" strokeLinecap="round">
        <path d="M19.4 12.7c-.3-1.6-1.7-2.4-3.4-2.4-2 0-3.4 1-3.4 2.4 0 1.6 1.5 2.1 3.4 2.6 2 .5 3.6 1 3.6 2.8 0 1.5-1.5 2.5-3.6 2.5-1.9 0-3.4-.9-3.6-2.5" />
        <path d="M16 8.2v2.1M16 20.6v2.4" />
      </g>
    </svg>
  );
}

export function EthereumMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden focusable="false">
      <circle cx="12" cy="12" r="11" className="mark-eth-disc" />
      <g className="mark-eth-face">
        <path fillOpacity=".65" d="M12 4.5v5.55l4.7 2.1L12 4.5Z" />
        <path d="M12 4.5 7.3 12.15l4.7-2.1V4.5Z" />
        <path fillOpacity=".65" d="M12 15.98v3.53l4.7-6.5-4.7 2.97Z" />
        <path d="M12 19.51v-3.53L7.3 13.01l4.7 6.5Z" />
        <path fillOpacity=".4" d="M12 15.1l4.7-2.95-4.7-2.1v5.05Z" />
        <path fillOpacity=".85" d="M7.3 12.15 12 15.1v-5.05l-4.7 2.1Z" />
      </g>
    </svg>
  );
}
