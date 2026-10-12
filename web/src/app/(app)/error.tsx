"use client";
// A page that crashed inside the app shell (R4-0, D-227): this boundary sits under the app layout, so the rail, top line
// and dock stay and the way out is one tap; the root boundary (`app/error.tsx`) only answers a layout that threw.
import { BoundaryScreen } from "@/components/states/BoundaryScreen";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppError({ error, reset }: ErrorPageProps) {
  return <BoundaryScreen error={error} reset={reset} backHref="/markets" />;
}
