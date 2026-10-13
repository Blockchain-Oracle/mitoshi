"use client";
// A read the server couldn't make (R6, D-230): the states kit's frame in its warning tone — one line, and a retry that
// asks the server again (the failed read was never cached, so the retry is a fresh one). The kit pill is class-only.
import { RotateCw, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/kit/Pill";
import { StateFrame } from "@/components/states/EmptyState";
import { THEMES } from "./copy";

export function RetryPanel({ line }: { line: string }) {
  const router = useRouter();
  return (
    <StateFrame
      slot="error"
      role="alert"
      tone="warning"
      title={line}
      icon={<TriangleAlert aria-hidden />}
      actions={
        <Pill tone="ghost" size="sm" onClick={() => router.refresh()}>
          <RotateCw aria-hidden className="size-4" />
          {THEMES.retry}
        </Pill>
      }
    />
  );
}
