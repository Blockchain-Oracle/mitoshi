"use client";
// An address with no launch (R6 money, S02 + T16; D-230) — native-of the app's 404 (`NotFoundScreen`, From 21st.dev 29419
// ziegfiroyt/error9 lineage; Owarine's VOID ticket), reusing its CSS and mark without editing it: a Window that voided,
// here a launch the registry has no record of — the address on the ticket (from the address bar, as the 404 reads its
// path), "No record", "Nothing to trade", and the two ways on: See launches (ink) and Launch a coin.
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import MitoshiMark from "@/components/shell/MitoshiMark";
import { NOT_FOUND } from "@/lib/copy";
import { LAUNCH } from "./copy";
import "@/styles/not-found.css";

const noStore = () => () => {};
const tokenOfPath = () => {
  const last = window.location.pathname.split("/").filter(Boolean).at(-1) ?? "";
  return /^0x[0-9a-fA-F]{40}$/.test(last) ? `${last.slice(0, 6)}…${last.slice(-4)}` : last;
};
const noPath = () => null;

export function LaunchVoid() {
  usePathname();
  const token = useSyncExternalStore(noStore, tokenOfPath, noPath);
  const V = LAUNCH.void;
  return (
    <div className="nf">
      <div className="nf-col">
        <div className="nf-title-wrap">
          <h1 className="nf-title">{NOT_FOUND.title}</h1>
          <span className="nf-void" aria-hidden>{NOT_FOUND.void}</span>
        </div>
        <div className="nf-ticket">
          <span aria-hidden className="nf-seal"><MitoshiMark /></span>
          <dl className="nf-rows">
            <div className="nf-row">
              <dt>{V.launch}</dt>
              <dd className="nf-path">{token}</dd>
            </div>
            <div className="nf-row">
              <dt>{V.registry}</dt>
              <dd className="nf-missing">{V.noRecord}</dd>
            </div>
            <div className="nf-row">
              <dt>{NOT_FOUND.result}</dt>
              <dd className="nf-result">{V.nothing}</dd>
            </div>
          </dl>
        </div>
        <div className="nf-actions">
          <Link href="/launch" className="nf-pill nf-pill--ink">
            {V.see} <ArrowRight aria-hidden />
          </Link>
          <Link href="/launch/meme" className="nf-pill">{V.create}</Link>
        </div>
      </div>
    </div>
  );
}
