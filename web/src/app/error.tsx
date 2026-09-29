"use client";
// Ported from Masayume 68f7a09:web/src/app/error.tsx

import { BoundaryScreen } from "@/components/states";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Route-level boundary — the reference's `app/error.tsx`, inside the shell the root layout keeps. */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return <BoundaryScreen error={error} reset={reset} backHref="/markets" />;
}
