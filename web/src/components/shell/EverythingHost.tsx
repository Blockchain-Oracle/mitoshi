"use client";
// Mounts the Everything drawer when the URL names it (`?d=everything`, D-190): Back closes it, a link can open it.
// The drawer (Base UI Drawer + every destination) is a lazy island preloaded on idle — never first-load JS (§3.1).
import { usePathname } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type ComponentType } from "react";
import { onIdle } from "@/lib/idle";
import { closeDrawer, useDrawerParam } from "@/lib/drawer-param";
import type { EverythingDrawerProps } from "./EverythingDrawer";

let drawerModule: Promise<ComponentType<EverythingDrawerProps>> | null = null;
const loadDrawer = () => (drawerModule ??= import("./EverythingDrawer").then((m) => m.EverythingDrawer));

function Host() {
  const { open } = useDrawerParam();
  const pathname = usePathname();
  const [Drawer, setDrawer] = useState<ComponentType<EverythingDrawerProps> | null>(null);
  const load = useCallback(() => void loadDrawer().then((C) => setDrawer(() => C)), []);
  const wanted = open === "everything";
  useEffect(() => onIdle(load), [load]);
  useEffect(() => {
    if (wanted) load();
  }, [wanted, load]);
  if (!Drawer) return null;
  return <Drawer open={wanted} onOpenChange={(next) => (next ? undefined : closeDrawer())} pathname={pathname} />;
}

export function EverythingHost() {
  return (
    <Suspense fallback={null}>
      <Host />
    </Suspense>
  );
}
