"use client";
// Ported from Owarine 90a91d71:web/src/features/x/XWalletCard.tsx (who this balance bets for comes first) as the linked-
// account card in /settings/account's grouped list (R4-11; 21st 28170 olewandowski1/connect-integration-cards' shape:
// the service, its state, one action) — S11 (D-227).
import { formatBaseUnits, USD_DECIMALS } from "@cwf/core";
import Link from "next/link";
import { PillButton, pillButtonVariants } from "@/components/kit/PillButton";
import { Masked } from "@/components/kit/Masked";
import { TFX, XCARD } from "./copy";
import { XGlyph } from "./parts";
import { useXGrant } from "./useXGrant";
import { useXLink, type XLink } from "./useXLink";
import "./x.css";

/** The settings row's detail: `@handle` when this account is the X route, else "Not linked". */
export function xRowDetail(link: Pick<XLink, "status" | "linkedHere">): string {
  return link.linkedHere && link.status?.binding ? `@${link.status.binding.handle ?? link.status.binding.authorId}` : XCARD.none;
}

export function XAccountSheet() {
  const link = useXLink();
  const grant = useXGrant();
  const xs = link.status?.session ?? null;
  return (
    <div className="flex flex-col gap-3">
      <div className="xt-balance">
        <span className="xt-done"><XGlyph /> <strong>{link.linkedHere ? xRowDetail(link) : xs ? `@${xs.handle ?? xs.authorId}` : XCARD.none}</strong></span>
        {grant.grant ? <span className="xt-balance-figure numbers"><Masked>${formatBaseUnits(grant.grant.budgetBase, USD_DECIMALS, { minDp: 2, maxDp: 2 })}</Masked></span> : null}
      </div>
      {link.linkedHere ? (
        <div className="xt-row">
          <Link href="/trade-from-x" className={pillButtonVariants({ tone: "ink", size: "md" })}>{XCARD.manage}</Link>
          <PillButton tone="ghost" size="md" disabled={link.busy !== ""} onClick={() => void link.unlink()}>{TFX.unlink}</PillButton>
        </div>
      ) : xs ? (
        <PillButton tone="accent" size="md" disabled={link.busy !== ""} onClick={() => void link.link()}>{TFX.linkAs(xs.handle ?? xs.authorId)}</PillButton>
      ) : link.status?.configured ? (
        <PillButton tone="accent" size="md" disabled={link.busy !== ""} onClick={() => void link.start("/settings/account")}><XGlyph /> {TFX.signIn}</PillButton>
      ) : (
        <p className="xt-note">{TFX.waitsOn}</p>
      )}
      {link.error ? <p className="xt-err" role="alert">{link.error}</p> : null}
      {link.ok ? <p className="xt-ok" role="status">{link.ok}</p> : null}
    </div>
  );
}
