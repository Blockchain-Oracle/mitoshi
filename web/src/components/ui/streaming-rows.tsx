"use client";
/**
 * From 21st.dev 29368 rmahammad/streaming-data-rows — revamped per D-044 for the launch page's trade tape (R6 money,
 * S02; D-230): a live table that takes new rows from the host and marks only the newest arrivals (an 8 px slide and an
 * accent-wash background fading over 1.2 s — 29368's pulse), with its loading, empty and error slots filled by the
 * states kit. Changed: columns are plain config (`cell` renders), no sorting UI, no row actions, no per-cell numeric
 * morph (a trade never changes once printed), the motion is CSS (off under reduced motion) instead of motion/react's
 * layout animations, Mitoshi's 44 px hairline rows, and the first paint marks nothing (only what arrives while open).
 */
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./streaming-rows.css";

export interface StreamColumn<T> {
  key: string;
  header: ReactNode;
  align?: "start" | "end";
  /** A narrow column (a chip, an age). */
  width?: "chip" | "auto";
  cell: (row: T) => ReactNode;
}

export interface StreamingRowsProps<T> {
  rows: readonly T[];
  columns: readonly StreamColumn<T>[];
  getRowId: (row: T) => string;
  /** The host's read: `loading` draws `loading`, `error` draws `error`, an empty `ready` draws `empty`. */
  state: "loading" | "error" | "ready";
  loading: ReactNode;
  empty: ReactNode;
  error: ReactNode;
  caption: string;
  className?: string;
}

export function StreamingRows<T>({ rows, columns, getRowId, state, loading, empty, error, caption, className }: StreamingRowsProps<T>) {
  // Ids already shown: a row not in it arrived while the table was open and gets the pulse; the first paint seeds it.
  const seen = useRef<Set<string> | null>(null);
  const ids = rows.map(getRowId);
  const fresh = seen.current === null ? new Set<string>() : new Set(ids.filter((id) => !seen.current!.has(id)));
  useEffect(() => {
    if (state === "ready") seen.current = new Set(ids);
  });
  if (state === "loading") return <>{loading}</>;
  if (state === "error") return <>{error}</>;
  if (rows.length === 0) return <>{empty}</>;
  return (
    <table className={cn("srows", className)}>
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} scope="col" data-align={c.align ?? "start"} data-width={c.width ?? "auto"}>{c.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const id = ids[i]!;
          return (
            <tr key={id} data-fresh={fresh.has(id) ? "" : undefined}>
              {columns.map((c) => (
                <td key={c.key} data-align={c.align ?? "start"}>{c.cell(row)}</td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
