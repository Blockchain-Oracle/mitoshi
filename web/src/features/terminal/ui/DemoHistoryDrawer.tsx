"use client";
// Signed-out History (R4-0, D-227; Owarine 90a91d71 `TerminalSheets` → the demo account sheet's history view): DEMO's
// paper trades in the terminal's right-edge drawer, the title tagged DEMO. It used to close and toast "Sign in to
// trade" while the paper trades sat recorded in this browser.
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { TERMINAL } from "../copy";
import { DemoHistory } from "./HistoryView";

export function DemoHistoryDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <SlideOver open={open} onOpenChange={onOpenChange}>
      <SlideOverContent
        title={
          <span className="tm-history-title">
            {TERMINAL.history.title} <span className="tm-demo-tag">{TERMINAL.equity.demo}</span>
          </span>
        }
      >
        <DemoHistory />
      </SlideOverContent>
    </SlideOver>
  );
}
