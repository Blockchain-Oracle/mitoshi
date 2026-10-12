"use client";
// The root 404 (R4-0, D-227; Owarine 90a91d71 renders its NotFoundScreen inside the shell): the root `not-found.tsx`
// is in every route's first load, so the frame — providers, wallet stack, rail, dock — loads as its own chunk when a 404
// renders (server-rendered with it, so the page arrives framed), never on the pages that don't 404.
import dynamic from "next/dynamic";
import { NotFoundScreen } from "./NotFoundScreen";

const Framed = dynamic(() => import("./FramedNotFound"), {
  loading: () => (
    <div className="nf-bare">
      <NotFoundScreen />
    </div>
  ),
});

export function NotFoundPage() {
  return <Framed />;
}
