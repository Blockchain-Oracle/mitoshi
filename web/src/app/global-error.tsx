"use client";
// Ported from Masayume 68f7a09:web/src/app/global-error.tsx

import { BoundaryScreen } from "@/components/states";
import { fontVariables } from "@/lib/fonts";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { cn } from "@/lib/utils";
import "@/styles/index.css";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * The root boundary: when the root layout itself throws there is no shell left, so this
 * renders its own document — the same face as the route boundary, painted in the resolved
 * theme on the first frame the way the layout does.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn("antialiased", fontVariables)} suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <BoundaryScreen error={error} reset={reset} backHref="/markets" root />
      </body>
    </html>
  );
}
