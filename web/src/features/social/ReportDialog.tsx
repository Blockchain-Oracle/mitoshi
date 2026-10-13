"use client";
// The report flow (S13, D-043): 21st 31359's centred dialog (`Modal`) with 28339's reasons list — one radio per reason,
// an optional note, one send. Used on room messages, takes and profiles. On a page (a profile, an agent) it carries
// `?d=report` so Back closes it rather than the page (D-190, R4-2); inside the Room's sheet it doesn't (the sheet holds ?d=).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { notify } from "@/lib/toast";
import { SOCIAL } from "./copy";

type Reason = keyof typeof SOCIAL.report.reasons;
const REASONS = Object.keys(SOCIAL.report.reasons) as Reason[];

export function ReportDialog({ open, onOpenChange, target, urlKey }: { open: boolean; onOpenChange: (o: boolean) => void; target: { kind: "comment" | "take" | "profile" | "agent" | "token"; id: string }; urlKey?: string }) {
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const words = SOCIAL.report;
  const send = async () => {
    if (!reason) return;
    setBusy(true);
    const res = await fetch("/api/social/report", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetKind: target.kind, targetId: target.id, reason, note }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return void notify.item({ id: "social-report", type: "warning", title: words.failed });
    const dup = ((await res.json().catch(() => ({}))) as { duplicate?: boolean }).duplicate;
    notify.item({ id: "social-report", title: dup ? words.again : words.sent });
    setReason(null);
    setNote("");
    onOpenChange(false);
  };
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      urlKey={urlKey}
      fields
      title={words.title}
      description={words.lead}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>{words.cancel}</Button>
          <Button size="sm" className="btn-primary" disabled={!reason || busy} onClick={() => void send()}>{words.send}</Button>
        </div>
      }
    >
      <fieldset className="flex flex-col gap-1">
        <legend className="sr-only">{words.title}</legend>
        {REASONS.map((r) => (
          <label key={r} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-surface-2">
            <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="size-4 accent-[var(--color-accent)]" />
            <span className="type-body text-ink">{words.reasons[r]}</span>
          </label>
        ))}
      </fieldset>
      <label className="mt-3 flex flex-col gap-1">
        <span className="type-caption text-ink-secondary">{words.note}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={3} className="rounded-md border border-hairline bg-surface-1 p-2 text-base text-ink" />
      </label>
    </Modal>
  );
}
