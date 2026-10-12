"use client";
// The root 404's body in the app's frame (R4-0, D-227): the VOID ticket inside the providers and the shell, so an
// unmatched URL keeps the rail, top line and dock. Its own chunk — `NotFoundPage` loads it when a 404 renders.
import { AppFrame } from "@/components/shell/AppFrame";
import { NotFoundScreen } from "./NotFoundScreen";

export default function FramedNotFound() {
  return (
    <AppFrame>
      <NotFoundScreen />
    </AppFrame>
  );
}
