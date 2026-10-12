// The 404 for every unmatched URL and any `notFound()` outside the app group (R4-0, D-227; Owarine 90a91d71
// `app/not-found.tsx`): the VOID ticket in the app's frame, which loads with the 404 only (`NotFoundPage`), and the
// status stays 404. An app page's `notFound()` renders `app/(app)/not-found.tsx`, inside the group's frame.
import type { Metadata } from "next";
import { NotFoundPage } from "@/features/not-found/NotFoundPage";
import { NOT_FOUND } from "@/lib/copy";

export const metadata: Metadata = { title: NOT_FOUND.pageTitle };

export default function NotFound() {
  return <NotFoundPage />;
}
