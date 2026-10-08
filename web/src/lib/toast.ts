// Ported from Masayume 68f7a09:web/src/lib/toast.ts — now a queue in front of a lazy toast layer (§3.1): the Base UI
// toast stack loads with the first notification (`components/ui/ToastHost`), and anything raised before it is ready
// is delivered in order once it is.

export interface ToastItem {
  /** A toast with the same id replaces this one in place (Tradash: "Opening…" becomes "Opened"; S23, D-202). */
  id?: string;
  title: string;
  description?: string;
  /** Neutral (no type), warning for degraded truth, loading while an action is in flight (kept until replaced). */
  type?: "warning" | "loading";
  /** Milliseconds on screen; 0 keeps it until replaced or dismissed. Defaults: Base UI's, and 0 for loading. */
  timeout?: number;
  /** One action button (Sign in, Close for $X, Add $25). */
  action?: { label: string; onClick: () => void };
}

export const TOAST_EVENT = "cwf:toast";
const pending: ToastItem[] = [];
let sink: ((item: ToastItem) => void) | null = null;

/** The toast layer registers here once mounted; queued items drain into it. Returns an unregister. */
export function setToastSink(next: ((item: ToastItem) => void) | null): () => void {
  sink = next;
  if (next) for (const item of pending.splice(0)) next(item);
  return () => {
    if (sink === next) sink = null;
  };
}

function push(item: ToastItem): void {
  if (sink) return sink(item);
  pending.push(item);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TOAST_EVENT));
}

/**
 * Color law: no success/error toasts — neutral for records, warning for degraded truth (kept by D-202 for the terminal,
 * which takes Tradash's toast mechanics — replace by id, a loading state, one action — but not its green and red).
 */
export const notify = {
  neutral: (title: string, description?: string) => push({ title, ...(description ? { description } : {}) }),
  warning: (title: string, description?: string) => push({ title, ...(description ? { description } : {}), type: "warning" }),
  /** The full item: an id to replace, loading, a timeout, an action. */
  item: (item: ToastItem) => push(item),
};
