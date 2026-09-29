"use client";
// The lazy toast layer: Masayume's toast stack (`toast.tsx`) mounted as a sibling of the app (it wraps nothing), fed
// by `lib/toast`'s queue.
import { useEffect } from "react";
import { setToastSink } from "@/lib/toast";
import { Toaster, toast } from "./toast";

export default function ToastLayer({ limit }: { limit: number }) {
  useEffect(() => setToastSink((item) => void toast.add(item)), []);
  return <Toaster limit={limit} />;
}
