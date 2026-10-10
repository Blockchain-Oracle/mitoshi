// Ported from Masayume 52a86fc:web/src/features/pitch/types.ts unchanged.
import type { ReactNode } from "react";

/** One folio page: the section word in the header, which paper it sits on, and its content. */
export interface Slide {
  id: string;
  section: string;
  /** `2` selects the reference's second paper (`PAPER2`); default is the cover paper. */
  paper?: 2;
  render: () => ReactNode;
}
