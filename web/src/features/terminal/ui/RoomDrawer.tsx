"use client";
// The room on the terminal (S13 step 3): a right-edge drawer (the owner's overlay rule) with the ticker's room and, when a
// Window is on screen, that Window's own — anyone reads; posting asks for the one sign-in and a call there.
import { useState } from "react";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { MotionScope } from "@/components/motion-scope";
import { SOCIAL } from "@/features/social/copy";
import { RoomPanel } from "@/features/social/RoomPanel";

export function RoomDrawer({ open, onOpenChange, symbol, marketId }: { open: boolean; onOpenChange: (o: boolean) => void; symbol: string; marketId: string | null }) {
  const [which, setWhich] = useState<"ticker" | "window">("ticker");
  const onWindow = which === "window" && marketId !== null;
  return (
    <SlideOver open={open} onOpenChange={onOpenChange}>
      <SlideOverContent title={SOCIAL.room.ticker(symbol)}>
        {open ? (
          <div className="flex h-full min-h-0 flex-col gap-3">
            {marketId ? (
              <MotionScope>
                <SegmentedControl
                  label={SOCIAL.room.title}
                  value={onWindow ? "window" : "ticker"}
                  onValueChange={(v) => setWhich(v)}
                  options={[{ value: "ticker", label: SOCIAL.room.ticker(symbol) }, { value: "window", label: SOCIAL.room.window }]}
                />
              </MotionScope>
            ) : null}
            <RoomPanel key={onWindow ? marketId : symbol} room={onWindow ? marketId! : `$${symbol}`} what={onWindow ? SOCIAL.room.thisWindow : symbol} />
          </div>
        ) : null}
      </SlideOverContent>
    </SlideOver>
  );
}
