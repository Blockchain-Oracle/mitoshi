"use client";
// Price alerts on the terminal (S13 step 7): a right-edge drawer (the owner's overlay rule) over the market on screen.
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { ALERTS } from "@/features/alerts/copy";
import { PriceAlertsPanel } from "@/features/alerts/PriceAlertsPanel";

export function AlertsDrawer({ open, onOpenChange, symbol }: { open: boolean; onOpenChange: (o: boolean) => void; symbol: string }) {
  return (
    <SlideOver open={open} onOpenChange={onOpenChange}>
      <SlideOverContent title={`${ALERTS.title} · ${symbol}`}>{open ? <PriceAlertsPanel key={symbol} symbol={symbol} /> : null}</SlideOverContent>
    </SlideOver>
  );
}
