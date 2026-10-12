// The 404 inside the app shell (R4-0, D-227; Owarine 90a91d71 `app/not-found.tsx`): a `notFound()` from any app page
// renders here, under the app layout — the rail, top line and dock stay. Unmatched paths take the root one, in the same
// frame (`app/not-found.tsx`).
import type { Metadata } from "next";
import { NotFoundScreen } from "@/features/not-found/NotFoundScreen";
import { NOT_FOUND } from "@/lib/copy";

export const metadata: Metadata = { title: NOT_FOUND.pageTitle };

export default function NotFound() {
  return <NotFoundScreen />;
}
