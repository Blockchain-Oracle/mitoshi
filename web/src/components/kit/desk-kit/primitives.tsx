"use client";
// Ported from Owarine 90a91d71:web/src/components/ui/desk-kit/primitives.tsx (R4-2, D-227) — the desk kit's controls,
// each adapted there from a 21st catalogue component (Number Ticker #21513, Underline Tabs #24956, Slider "value left"
// #10339, Icon Card Radio Group #28351, Status Dot #24882), here on Mitoshi's tokens. NumberTicker is the kit Odometer
// (one rolling-digit component in the app).
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Odometer } from "../Odometer";

/** Rolling digits for a dollar or percent figure; display only, the money stays in bigints upstream. */
export function NumberTicker({ value, format = "usd", decimals = 2, className }: { value: number; format?: "usd" | "pct" | "plain"; decimals?: number; className?: string }) {
  return <Odometer value={value} kind={format} decimals={decimals} tone={false} className={cn("dkit-ticker", className)} />;
}

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
  icon?: ReactNode;
}

/** Underline tabs with a sliding accent bar; the panels are the caller's `TabsPanel`s. */
export function UnderlineTabs<T extends string>({ value, onChange, items, children, className, label }: { value: T; onChange: (v: T) => void; items: readonly TabItem<T>[]; children: ReactNode; className?: string; label: string }) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={(v) => onChange(v as T)} className={cn("dkit-tabs", className)}>
      <TabsPrimitive.List className="dkit-tabs-list" aria-label={label}>
        {items.map((t) => (
          <TabsPrimitive.Tab key={t.value} value={t.value} className="dkit-tab">
            {t.icon}
            <span>{t.label}</span>
            {t.count !== undefined ? <span className="dkit-tab-count">{t.count}</span> : null}
          </TabsPrimitive.Tab>
        ))}
        <TabsPrimitive.Indicator className="dkit-tabs-indicator" />
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}

export function TabsPanel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.Panel value={value} className={cn("dkit-tabs-panel", className)}>
      {children}
    </TabsPrimitive.Panel>
  );
}

/** A labelled slider with its value on the left of the track. Inside a sheet its drag never dismisses the sheet. */
export function Slider({ value, onChange, min, max, step, label, display, tone, disabled }: { value: number; onChange: (v: number) => void; min: number; max: number; step: number; label: string; display: string; tone?: string; disabled?: boolean }) {
  return (
    <SliderPrimitive.Root
      className="dkit-slider"
      data-base-ui-swipe-ignore=""
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={(v) => onChange(Array.isArray(v) ? (v[0] as number) : (v as number))}
      style={tone ? ({ "--dkit-tone": tone } as CSSProperties) : undefined}
    >
      <span className="dkit-slider-value" aria-hidden>{display}</span>
      <SliderPrimitive.Control className="dkit-slider-control">
        <SliderPrimitive.Track className="dkit-slider-track">
          <SliderPrimitive.Indicator className="dkit-slider-fill" />
          <SliderPrimitive.Thumb className="dkit-slider-thumb" aria-label={label} getAriaValueText={() => display} />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export interface RadioCardItem<T extends string> {
  value: T;
  title: ReactNode;
  body?: ReactNode;
  media?: ReactNode;
  footer?: ReactNode;
}

/** Cards that behave as one radio group (arrow keys move, one is chosen); the media slot takes logos or an icon. */
export function RadioCards<T extends string>({ value, onChange, items, label, className }: { value: T | null; onChange: (v: T) => void; items: readonly RadioCardItem<T>[]; label: string; className?: string }) {
  return (
    <RadioGroup value={value ?? ""} onValueChange={(v) => onChange(v as T)} aria-label={label} className={cn("dkit-radio-cards", className)}>
      {items.map((item) => (
        <Radio.Root key={item.value} value={item.value} className="dkit-radio-card">
          <span className="dkit-radio-dot" aria-hidden>
            <Radio.Indicator className="dkit-radio-dot-on" />
          </span>
          {item.media ? <span className="dkit-radio-media">{item.media}</span> : null}
          <span className="dkit-radio-title">{item.title}</span>
          {item.body ? <span className="dkit-radio-body">{item.body}</span> : null}
          {item.footer ? <span className="dkit-radio-footer">{item.footer}</span> : null}
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}

export type DotTone = "live" | "practice" | "warn" | "stopped" | "quiet";

/** A state dot; "live" pulses (not under reduced motion), the rest hold still. */
export function StatusDot({ tone, children, className }: { tone: DotTone; children?: ReactNode; className?: string }) {
  return (
    <span className={cn("dkit-status", className)} data-tone={tone}>
      <span className="dkit-status-dot" aria-hidden />
      {children}
    </span>
  );
}
