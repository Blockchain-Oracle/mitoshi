// From 21st.dev 25162 corr/key-value-list — revamped per D-044 (R4-12, D-227): the definition list on Mitoshi ink and
// hairlines, values in the data face, an optional link per value (explorer ↗), and two columns from a narrow width up
// (the label never wraps under its value on a phone either). Styles in `styles/bridge-kit.css`.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface KeyValueItem {
  label: ReactNode;
  value: ReactNode;
  description?: ReactNode;
}

export function KeyValueList({ items, className, label }: { items: readonly KeyValueItem[]; className?: string; label?: string }) {
  return (
    <dl className={cn("kvl", className)} aria-label={label}>
      {items.map((item, i) => (
        <div key={i} className="kvl-row">
          <dt className="kvl-k">{item.label}</dt>
          <dd className="kvl-v">
            <span className="kvl-val">{item.value}</span>
            {item.description ? <span className="kvl-note">{item.description}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
