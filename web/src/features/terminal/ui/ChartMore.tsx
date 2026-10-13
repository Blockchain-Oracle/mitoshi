"use client";
// The chart tools' overflow (R4-3, D-227): From 21st.dev 25320 unlumen/expand-menu, revamped — its trigger and its
// icon-plus-one-word items, staggered in as they open, on Base UI Menu for the semantics (focus, arrow keys, Escape and
// an outside tap close it), in the terminal's glass (`tm-glass`), 44 px rows, CSS animation instead of motion. Owarine
// ships only three chart controls (interval, line/candles, music); Mitoshi's Depth, Room, Sensei and Alerts wait here.
import { Menu } from "@base-ui/react/menu";
import type { CSSProperties } from "react";
import { Bell, Ellipsis, Layers, MessageCircle, Sparkles } from "lucide-react";
import { tapFeedback } from "@/lib/feedback";
import { TERMINAL } from "../copy";

interface ChartMoreProps {
  depthOn: boolean;
  onDepth: (on: boolean) => void;
  onRoom?: () => void;
  onSensei?: () => void;
  onAlerts?: () => void;
}

export function ChartMore({ depthOn, onDepth, onRoom, onSensei, onAlerts }: ChartMoreProps) {
  const items = [
    { key: "depth", icon: <Layers aria-hidden />, label: TERMINAL.controls.moreDepth, on: depthOn, run: () => onDepth(!depthOn) },
    onRoom ? { key: "room", icon: <MessageCircle aria-hidden />, label: TERMINAL.controls.moreRoom, on: false, run: onRoom } : null,
    onSensei ? { key: "sensei", icon: <Sparkles aria-hidden />, label: TERMINAL.controls.moreSensei, on: false, run: onSensei } : null,
    onAlerts ? { key: "alerts", icon: <Bell aria-hidden />, label: TERMINAL.controls.moreAlerts, on: false, run: onAlerts } : null,
  ].filter((i) => i !== null);
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger className={`tm-glass tm-ctl${depthOn ? " is-on" : ""}`} aria-label={TERMINAL.controls.more} title={TERMINAL.controls.more} onClick={() => tapFeedback()}>
        <Ellipsis aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="top" align="start" sideOffset={8} collisionPadding={12} className="tm-more-pos">
          <Menu.Popup className="tm-glass tm-more">
            {items.map((item, i) => (
              <Menu.Item key={item.key} className="tm-more-item" data-on={item.on ? "" : undefined} style={{ "--i": i } as CSSProperties} onClick={() => (tapFeedback(), item.run())}>
                {item.icon}
                <span>{item.label}</span>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
