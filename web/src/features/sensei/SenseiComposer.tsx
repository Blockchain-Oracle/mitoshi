"use client";
// From 21st.dev 12399 serafimcloud/input-bar, revamped per D-044 for Sensei (S13 step 8): the auto-growing field (to
// 120 px, then it scrolls), Enter asks and Shift+Enter breaks the line, one button that sends or stops a streaming
// answer, a click anywhere on the bar focuses the field. Attachments and the toolbar slots are dropped (Sensei reads
// text only); 16 px type so iOS doesn't zoom; a 44 px button; Mitoshi tokens.
import { ArrowUp, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SENSEI } from "./copy";
import { MAX_QUESTION } from "./useSenseiChat";

const MAX_HEIGHT_PX = 120;

export function SenseiComposer({ busy, disabled, onSend, onStop }: { busy: boolean; disabled?: boolean; onSend: (text: string) => void; onStop: () => void }) {
  const [text, setText] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [text]);
  const tooLong = text.length > MAX_QUESTION;
  const canSend = !busy && !disabled && text.trim().length > 0 && !tooLong;
  const send = () => {
    if (!canSend) return;
    onSend(text);
    setText("");
  };
  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(e) => (e.preventDefault(), send())}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("button, textarea")) field.current?.focus();
      }}
    >
      <div className="flex cursor-text items-end gap-2 rounded-2xl border border-hairline bg-surface-1 py-1.5 pr-1.5 pl-3.5 focus-within:border-accent">
        <textarea
          ref={field}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) (e.preventDefault(), send());
          }}
          placeholder={SENSEI.placeholder}
          aria-label={SENSEI.placeholder}
          aria-invalid={tooLong || undefined}
          disabled={disabled}
          className="min-h-touch flex-1 resize-none overflow-hidden bg-transparent py-2.5 text-base leading-snug text-ink outline-none placeholder:text-ink-secondary disabled:opacity-50"
        />
        {busy ? (
          <button type="button" onClick={onStop} aria-label={SENSEI.stop} className="grid size-touch flex-none place-items-center rounded-full bg-ink text-surface-1">
            <Square aria-hidden className="size-3.5 fill-current" />
          </button>
        ) : (
          <button type="submit" disabled={!canSend} aria-label={SENSEI.send} className="grid size-touch flex-none place-items-center rounded-full bg-accent-fill text-on-accent disabled:opacity-40">
            <ArrowUp aria-hidden className="size-4" />
          </button>
        )}
      </div>
      {tooLong ? <p role="alert" className="px-1 type-caption text-warning">{SENSEI.tooLong(MAX_QUESTION)}</p> : null}
    </form>
  );
}
