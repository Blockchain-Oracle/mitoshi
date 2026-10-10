// From 21st.dev 19366 corr/notice-alert, revamped per D-044 for S6's halt and closed banners: the source's icon ·
// title · description row and its tones are kept; shadcn's Alert and the amber/blue/emerald palettes become Mitoshi's
// surfaces and tokens (warning for a halt, the accent for a session note, neutral info); `role` is the host's — "alert"
// only for what just changed under the user (a halt), "status" for standing facts — so a screen reader is not shouted at.
import { AlertCircle, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

export type NoticeAlertTone = "info" | "accent" | "warning";

const TONE: Record<NoticeAlertTone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: "border-hairline bg-surface-1 text-ink", icon: "text-ink-secondary", Icon: Info },
  accent: { box: "border-accent/30 bg-accent/10 text-ink", icon: "text-accent", Icon: AlertCircle },
  warning: { box: "border-warning bg-surface-1 text-ink", icon: "text-warning", Icon: TriangleAlert },
};

export function NoticeAlert({ title, description, tone = "info", role = "status", className }: { title: string; description?: ReactNode; tone?: NoticeAlertTone; role?: "status" | "alert"; className?: string }) {
  const t = TONE[tone];
  return (
    <div role={role} className={`flex items-start gap-3 rounded-md border px-3 py-2.5 ${t.box} ${className ?? ""}`}>
      <t.Icon aria-hidden className={`mt-0.5 size-4 flex-none ${t.icon}`} />
      <div className="min-w-0">
        <p className="type-body-strong">{title}</p>
        {description ? <p className="type-caption text-ink-secondary">{description}</p> : null}
      </div>
    </div>
  );
}
