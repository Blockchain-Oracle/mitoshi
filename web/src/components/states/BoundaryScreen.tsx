"use client";
// Ported from Masayume 68f7a09:web/src/components/states/BoundaryScreen.tsx

import { ERROR_BOUNDARY } from "@cwf/core/copy";
import { useEffect } from "react";

interface BoundaryScreenProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** The route out; the reference's is the markets. */
  backHref?: string;
  /** Fills the viewport when there is no shell around it (the root boundary). */
  root?: boolean;
}

/**
 * The error boundary's face — ported from `reference/yosuku/app/error.tsx`: centered,
 * calm, on-brand, with a retry and a route out in both themes. Layout lives in error.css.
 * The technical disclosure under the actions is ours (additive); the way out is a plain
 * link so a fresh navigation clears whatever state threw.
 */
export function BoundaryScreen({ error, reset, backHref = "/markets", root = false }: BoundaryScreenProps) {
  useEffect(() => {
    // Surface for logs without breaking the UI.
    console.error(error);
  }, [error]);
  const technical = error.digest ? `${error.message} (digest ${error.digest})` : error.message;

  return (
    <div className={root ? "boundary boundary-root" : "boundary"} role="alert">
      <h1 className="boundary-title">{ERROR_BOUNDARY.headline}</h1>
      <p className="boundary-body">{ERROR_BOUNDARY.body}</p>
      <div className="boundary-actions">
        <button type="button" className="boundary-retry" onClick={() => reset()}>
          {ERROR_BOUNDARY.retry}
        </button>
        <a href={backHref} className="boundary-out">
          {ERROR_BOUNDARY.back}
        </a>
      </div>
      <details className="boundary-details">
        <summary>{ERROR_BOUNDARY.technical}</summary>
        <pre>{technical}</pre>
      </details>
    </div>
  );
}
