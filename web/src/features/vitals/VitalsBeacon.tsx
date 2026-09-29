"use client";
// Loads the field-vitals reporter on idle (its buffered observers still see the whole page load), so measuring
// performance costs the first load nothing (§3.1).
import { useEffect } from "react";
import { onIdle } from "@/lib/idle";

export function VitalsBeacon() {
  useEffect(() => onIdle(() => void import("./report").then((m) => m.startVitals())), []);
  return null;
}
