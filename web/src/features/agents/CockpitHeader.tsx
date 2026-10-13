"use client";
// Ported from Owarine 90a91d71:web/src/features/desk/cockpit/CockpitHeader.tsx + DeskControls.tsx (R4-6, D-227) — the
// agent's head: its portrait as the 64 px mark, "AGENT #12 · BTC 5m", the name, the runner's state as a StatusDot, and the
// toolbar on the right — Copy pinned (the one action, in the head on a phone too) and More (Report · Block · Share) on
// Base UI's Menu.
import { Menu } from "@base-ui/react/menu";
import { Ban, Copy as CopyIcon, Ellipsis, Flag, Share2 } from "lucide-react";
import { StatusDot } from "@/components/kit/desk-kit";
import { AgentPortrait } from "../strategies/AgentPortrait";
import { STRATEGIES } from "../strategies/copy";
import { strategyIdentity } from "../strategies/identity";
import type { StrategyWire } from "../strategies/protocol";
import { HEALTH_TONE } from "../strategies/StrategyCard";
import { AGENTS } from "./copy";
import "../strategies/head.css";

const C = AGENTS.cockpit;

export function CockpitHeader({ s, copying, onCopy, onReport, onBlock, onShare }: { s: StrategyWire; copying: boolean; onCopy: () => void; onReport: () => void; onBlock: () => void; onShare: () => void }) {
  const { name, seed } = strategyIdentity(s);
  const more = [
    { key: "report", label: C.report, icon: <Flag />, run: onReport, tone: undefined },
    { key: "block", label: C.block, icon: <Ban />, run: onBlock, tone: "danger" as const },
    { key: "share", label: C.share, icon: <Share2 />, run: onShare, tone: undefined },
  ];
  return (
    <header className="cp-head">
      <div className="cp-head-id">
        <span className="cp-head-mark"><AgentPortrait seed={seed} name={name} /></span>
        <div className="cp-head-text">
          <span className="strat-meta text-accent">{C.eyebrow(s.agentId, s.envelope.seriesLabel)}</span>
          <div className="cp-head-title"><h1 className="strat-h1">{name}</h1></div>
          <div className="cp-head-meta">
            <StatusDot tone={s.active ? HEALTH_TONE[s.health.kind] : "stopped"}>{s.active ? STRATEGIES.health[s.health.kind] : STRATEGIES.card.closed}</StatusDot>
          </div>
        </div>
      </div>
      <div className="cp-actions" role="toolbar" aria-label={C.tabsLabel}>
        <button type="button" data-primary-action="" className="cp-action" data-tone="primary" data-pinned="" data-first="" disabled={!s.active && !copying} onClick={onCopy}>
          <CopyIcon />
          <span>{copying ? C.copying : C.copy}</span>
        </button>
        <Menu.Root>
          <Menu.Trigger className="cp-action cp-more" aria-label={C.more}>
            <Ellipsis />
            <span>{C.more}</span>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={8} align="end" className="cp-menu-positioner">
              <Menu.Popup className="cp-menu">
                {more.map((m) => (
                  <Menu.Item key={m.key} className="cp-menu-item" data-tone={m.tone} onClick={m.run}>
                    {m.icon}
                    {m.label}
                  </Menu.Item>
                ))}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
    </header>
  );
}
