// The network pill beside the mark (S22, Slush's testnet pill; D-191): every page says it runs on Tempo's Moderato
// testnet — test dollars, real trades, nothing of value. Mainnet shows nothing here.
import { SHELL } from "@/lib/copy";
import { webEnv } from "@/lib/env";
import { cn } from "@/lib/utils";

export function NetworkPill({ className }: { className?: string }) {
  if (webEnv.markets.network !== "testnet") return null;
  return (
    <span className={cn("network-pill", className)} title={SHELL.testnetTitle}>
      <span aria-hidden className="network-dot" />
      <span className="network-label">{SHELL.testnet}</span>
    </span>
  );
}
