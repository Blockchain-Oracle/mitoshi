// /proof/<market>'s wait (R4-13a, D-227; R4-10's status frame): the frame with the placeholder its Suspense shows, for
// the page and its loading boundary.
import type { ReactNode } from "react";
import { LoadingState } from "@/components/states";
import "@/styles/status.css";
import "./proof.css";

export function ProofFrame({ children }: { children: ReactNode }) {
  return <div className="container status-page proof-page">{children}</div>;
}

export const ProofReading = () => <LoadingState shape="table" />;

export function ProofLoading() {
  return (
    <ProofFrame>
      <ProofReading />
    </ProofFrame>
  );
}
