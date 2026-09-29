"use client";
// Second stage of the web fonts (D-071): once the page is idle after first paint, body and figure faces apply.
import { useEffect } from "react";
import { onIdle } from "@/lib/idle";

export function FontStage() {
  useEffect(() => onIdle(() => document.documentElement.classList.add("wf-late")), []);
  return null;
}
