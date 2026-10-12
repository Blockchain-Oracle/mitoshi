"use client";
// Ported from Owarine 90a91d71:web/src/components/kit/Keypad.tsx (R4-2, D-227) — UGLYCASH's big amount keypad: three
// columns of large digits, a point and delete, no key borders. The typed string is the caller's; `pressKey`
// (@cwf/core/input, tested once for web and the app) decides what each press does, so an amount is never a float. The
// physical keyboard works too while it is mounted (not while a field has focus). Inside a sheet a press-and-drift must
// not dismiss it (`data-base-ui-swipe-ignore`).
import { pressKey, type KeypadKey, type KeypadRules } from "@cwf/core/input";
import { Delete } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

const KEYS: readonly KeypadKey[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];

export interface KeypadProps {
  value: string;
  onChange: (next: string) => void;
  rules?: KeypadRules;
  onPress?: (key: KeypadKey) => void;
  /** Words for the group and the two non-digit keys. */
  labels: { group: string; del: string; point: string };
  className?: string;
}

export function Keypad({ value, onChange, rules, onPress, labels, className }: KeypadProps) {
  const press = (key: KeypadKey) => {
    onPress?.(key);
    onChange(pressKey(value, key, rules));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const key: KeypadKey | null = /^[0-9]$/.test(e.key) ? (e.key as KeypadKey) : e.key === "." || e.key === "," ? "." : e.key === "Backspace" ? "del" : null;
      if (!key) return;
      e.preventDefault();
      onPress?.(key);
      onChange(pressKey(value, key, rules));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [value, onChange, onPress, rules]);

  return (
    <div role="group" aria-label={labels.group} data-base-ui-swipe-ignore="" className={cn("kit-keypad", className)}>
      {KEYS.map((key) => (
        <button key={key} type="button" className="kit-key" aria-label={key === "del" ? labels.del : key === "." ? labels.point : key} onClick={() => press(key)}>
          {key === "del" ? <Delete aria-hidden strokeWidth={2.25} /> : key}
        </button>
      ))}
    </div>
  );
}
