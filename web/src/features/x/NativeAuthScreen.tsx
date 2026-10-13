"use client";
// Ported in role from Owarine 90a91d71:web/src/app/native-auth/page.tsx and its native-code route (C4d M2a) — S11 with
// SM2's handoff (D-227), on the app's existing web-view shell (no native module): the X sign-in ran in the system
// browser; there `?handoff=<code>` shows one tap back to the app (`mitoshi://native-auth?code=`, which the shell opens in
// its web view); there `?code=` plus the verifier this web view kept is traded for the X session cookie, once.
import Link from "next/link";
import { useEffect, useState } from "react";
import { pillButtonVariants } from "@/components/kit/PillButton";
import { APP_LINK_SCHEME } from "@/lib/app-links";
import { NATIVE } from "./copy";
import { HANDOFF_CODE_PARAM, HANDOFF_PARAM, NATIVE_AUTH_PATH } from "./protocol";
import { clearHandoff, readHandoff } from "./useXLink";
import "./x.css";

const CODE = /^[A-Za-z0-9_-]{43}$/;

export function NativeAuthScreen() {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const handoff = params.get(HANDOFF_PARAM);
  const code = params.get(HANDOFF_CODE_PARAM);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!code || !CODE.test(code)) return;
    const kept = readHandoff();
    if (!kept) return setFailed(true);
    void fetch("/api/x/native-exchange", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, verifier: kept.verifier }) })
      .then((res) => {
        clearHandoff();
        if (!res.ok) return setFailed(true);
        window.location.replace(`${kept.returnTo.startsWith("/") && !kept.returnTo.startsWith("//") ? kept.returnTo : "/trade-from-x"}?x=1`);
      })
      .catch(() => setFailed(true));
  }, [code]);

  if (handoff && CODE.test(handoff)) {
    return (
      <section className="xt">
        <h1 className="type-display text-ink">{NATIVE.title}</h1>
        <a className={pillButtonVariants({ tone: "accent", size: "lg", block: true })} href={`${APP_LINK_SCHEME}://${NATIVE_AUTH_PATH}?${HANDOFF_CODE_PARAM}=${encodeURIComponent(handoff)}`}>{NATIVE.continue}</a>
      </section>
    );
  }
  if (code && CODE.test(code) && !failed) return <section className="xt"><p className="xt-note" role="status">{NATIVE.finishing}</p></section>;
  return (
    <section className="xt">
      <h1 className="type-display text-ink">{NATIVE.title}</h1>
      <p className="xt-note">{failed ? NATIVE.failed : NATIVE.why}</p>
      <Link href="/trade-from-x" className={pillButtonVariants({ tone: "ink", size: "md" })}>{NATIVE.web}</Link>
    </section>
  );
}
