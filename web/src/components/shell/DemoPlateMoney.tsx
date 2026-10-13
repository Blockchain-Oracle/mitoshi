"use client";
// The DEMO plate's paper balance and its eye (R6 shell S23), loaded after first paint like the tile it replaced: the
// demo store and the money format stay out of every route's first load; the plate keeps a same-size slot meanwhile.
import { Eye, EyeOff } from "lucide-react";
import { useDemoState } from "@/features/terminal/demo";
import { SHELL } from "@/lib/copy";
import { setPrivacy, usePrivacy } from "@/lib/privacy";
import { dollars } from "@/providers/wallet/format";

export function DemoPlateFigure() {
  const demo = useDemoState();
  const hidden = usePrivacy();
  return <span className="mode-plate-money numbers">{hidden ? SHELL.masked : dollars(BigInt(demo.balanceBase))}</span>;
}

export function DemoPlateEye() {
  const hidden = usePrivacy();
  return (
    <button type="button" className="mode-plate-eye" aria-pressed={hidden} aria-label={hidden ? SHELL.privacyShow : SHELL.privacyHide} title={hidden ? SHELL.privacyShow : SHELL.privacyHide} onClick={() => setPrivacy(!hidden)}>
      {hidden ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
    </button>
  );
}
