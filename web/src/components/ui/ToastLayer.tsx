"use client";
// The lazy toast layer: Masayume's toast stack (`toast.tsx`) mounted as a sibling of the app (it wraps nothing), fed
// by `lib/toast`'s queue.
import { useEffect } from "react";
import { setToastSink, type ToastItem } from "@/lib/toast";
import { Toaster, toast } from "./toast";

/** Ids on screen: a repeat id updates its toast in place instead of stacking a second one (D-202). */
const live = new Set<string>();

function show(item: ToastItem): void {
  const { action, timeout, id, ...rest } = item;
  const options = {
    ...rest,
    // Always named, even when absent: Base UI's update spreads over the toast it replaces, so a "Closing…" loading
    // toast updated to "Closed" kept `type: "loading"` — its spinner, and no timer — and sat over the phone's equity
    // pill until dismissed by hand (states run 38033455356). An outcome with no type is a plain, timed toast.
    type: item.type,
    timeout: timeout ?? (item.type === "loading" ? 0 : undefined),
    actionProps: action ? { children: action.label, onClick: action.onClick } : undefined,
  };
  if (id && live.has(id)) return void toast.update(id, options);
  const added = toast.add({ ...options, ...(id ? { id } : {}), onRemove: () => void live.delete(id ?? "") });
  if (id) live.add(added);
}

export default function ToastLayer({ limit }: { limit: number }) {
  useEffect(() => setToastSink(show), []);
  return <Toaster limit={limit} />;
}
