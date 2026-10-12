"use client";
// Ported from Masayume 68f7a09:web/src/app/error.tsx

import { BoundaryScreen } from "@/components/states/BoundaryScreen";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** The root boundary — the reference's `app/error.tsx`. It answers only when a group's layout threw (an app page's crash
 *  is `app/(app)/error.tsx`, inside the shell), so no shell is around it: it fills the viewport (R4-0, D-227). */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return <BoundaryScreen error={error} reset={reset} backHref="/markets" root />;
}
