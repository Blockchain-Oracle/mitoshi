// From 21st.dev 25163 corr/audit-log — revamped per D-044 (R4-12, D-227): the timestamped event list (time · what ·
// a status tag · one line of context) on Mitoshi ink, newest first; the original's context menu and field filters are
// dropped — the reserves log is a handful of re-checks and alerts, read top to bottom.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface AuditLogItem {
  id: string;
  time: string;
  title: string;
  tag: string;
  tone: "ok" | "warn" | "bad";
  detail?: ReactNode;
}

export function AuditLog({ items, label, empty, className }: { items: readonly AuditLogItem[]; label: string; empty: string; className?: string }) {
  if (items.length === 0) return <p className={cn("alog-empty", className)}>{empty}</p>;
  return (
    <ol className={cn("alog", className)} aria-label={label}>
      {items.map((i) => (
        <li key={i.id} className="alog-row">
          <span className="numbers alog-time">{i.time}</span>
          <span className="alog-title">{i.title}</span>
          <span className="alog-tag" data-tone={i.tone}>{i.tag}</span>
          {i.detail ? <span className="alog-detail">{i.detail}</span> : null}
        </li>
      ))}
    </ol>
  );
}
