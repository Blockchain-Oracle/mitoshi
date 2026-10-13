"use client";
// The profile's "…" menu (R4-10, D-227; Owarine 90a91d71 DeskControls' more-menu on Base UI Menu): Report and Block. An
// island of ProfileBar, so the route's first load carries no menu runtime.
import { Menu } from "@base-ui/react/menu";
import { MoreHorizontal } from "lucide-react";
import { PROFILE as P } from "./copy";

export function ProfileMore({ onReport, onBlock }: { onReport: () => void; onBlock: () => void }) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger className="prf-more" aria-label={P.more} title={P.more}>
        <MoreHorizontal aria-hidden className="size-5" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" collisionPadding={12} className="am-positioner">
          <Menu.Popup className="am-popup prf-menu">
            <Menu.Item className="am-item" onClick={onReport}>{P.report}</Menu.Item>
            <Menu.Item className="am-item" onClick={onBlock}>{P.block}</Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
