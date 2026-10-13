"use client";
// The profile's record couldn't be read (R6 money, S20): say so with Retry (a fresh server read), and show no figure.
import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/kit/Pill";
import { StateFrame } from "@/components/states/EmptyState";
import { PROFILE as P } from "./copy";

export function ProfileRetry() {
  const router = useRouter();
  return <StateFrame size="inline" tone="warning" role="alert" icon={<TriangleAlert />} title={P.unreadable} className="prf-section" actions={<Pill tone="ink" size="sm" onClick={() => router.refresh()}>{P.retry}</Pill>} />;
}
