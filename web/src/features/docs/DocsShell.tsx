"use client";
// /docs' frame (R4-10, D-227): the index is the accordion home (DocsHome, Owarine's /legal frame) at the stage's full
// width; every other page sits in the docs layout with its sidebar.
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DocsLayout } from "./DocsLayout";

export function DocsShell({ children }: { children: ReactNode }) {
  return usePathname() === "/docs" ? <div className="container">{children}</div> : <DocsLayout>{children}</DocsLayout>;
}
