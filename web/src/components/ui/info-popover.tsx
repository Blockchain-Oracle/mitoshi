"use client";
// From 21st.dev 398 originui/popover — revamped per D-044 for R4-7 (D-227; earn spec step 7): Radix → Base UI Popover
// (focus return, Escape, outside press), the surface-2 / hairline tokens instead of the demo's popover palette, an (i)
// trigger with a 44 px hit area (the glyph stays 16 px) and a one-line body. The note a figure's label can't carry, one
// tap away instead of on the page (Owarine has none). Motion is opacity only, off under reduced motion (`info-popover.css`).
import { Popover } from "@base-ui/react/popover";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import "./info-popover.css";

export function InfoPopover({ label, children, className }: { label: string; children: string; className?: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger className={cn("ui-info-trigger", className)} aria-label={label} title={label}>
        <Info aria-hidden className="ui-info-glyph" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} className="ui-info-pos">
          <Popover.Popup className="ui-info-popup">{children}</Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
