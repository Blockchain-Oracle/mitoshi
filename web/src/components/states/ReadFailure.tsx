// One notice per page (R6 shell S04/T05): a read that failed for a connection reason (rate-limited, the chain or the
// indexer down) keeps its section's skeleton — the top line's strip says what is happening and when it retries — and
// only a domain failure (a revert, not deployed) is said in the section. It used to be one error card per section,
// four on /markets for one outage, and an error as the ticket's title.
import type { Diagnosis } from "@cwf/core";
import type { ReactNode } from "react";
import { isConnectionKind } from "@/lib/connection-core";
import { ErrorState } from "./ErrorState";
import { LoadingState, type LoadingShape } from "./LoadingState";

export function ReadFailure({ diagnosis, retry, shape = "plate", placeholder, className }: { diagnosis: Diagnosis; retry?: () => void; shape?: LoadingShape; placeholder?: ReactNode; className?: string }) {
  if (isConnectionKind(diagnosis.kind)) return <>{placeholder ?? <LoadingState shape={shape} className={className} />}</>;
  return <ErrorState diagnosis={diagnosis} retry={retry} className={className} />;
}
