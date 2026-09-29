"use client";
// Mounts the toast layer (Base UI Toast, ~40 KB) only when the first notification is raised (§3.1).
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { TOAST_EVENT } from "@/lib/toast";

const ToastLayer = dynamic(() => import("./ToastLayer"), { ssr: false });

export function ToastHost({ limit = 1 }: { limit?: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const onToast = () => setMounted(true);
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);
  return mounted ? <ToastLayer limit={limit} /> : null;
}
