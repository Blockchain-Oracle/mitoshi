"use client";
// A theme's follow sheet (S16; R4-11, D-227) in the arm grammar of features/strategies/CopyDrawer.tsx: one sentence, the
// allocation with its caps behind "Adjust", a "What you are signing" disclosure, one passkey prompt. A follow is one
// root transaction `[authorizeKey(the agent's scoped key), follow]` (`theme-follow`, sponsored); the agent's key comes
// from ops' theme-key service, which is not live yet, so the CTA names that blocker instead of signing a key nobody
// holds. Unfollow works now: the agent stops, holdings stay in the wallet (`theme-unfollow`, sponsored).
import type { ThemeView } from "@cwf/markets/themes";
import { invalidateThemes } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SlideOver, SlideOverContent } from "@/components/kit";
import { signerOfKind as signerOf, TxCta, TxFailureCard, useTxLifecycle } from "@/components/tx";
import { useWalletSession } from "@/lib/wallet-session";
import { THEMES } from "./copy";

const F = THEMES.follow;

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="th-field">
      <span>{label}</span>
      <span className="th-field-input"><span aria-hidden>$</span><input value={value} inputMode="decimal" onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} className="numbers" /></span>
    </label>
  );
}

export function FollowSheet({ theme, following, open, onOpenChange }: { theme: ThemeView; following: boolean; open: boolean; onOpenChange: (o: boolean) => void }) {
  const session = useWalletSession();
  const queryClient = useQueryClient();
  const tx = useTxLifecycle();
  const [allocation, setAllocation] = useState("100");
  const [perTrade, setPerTrade] = useState("20");
  const [perDay, setPerDay] = useState("50");
  const [adjust, setAdjust] = useState(false);
  const name = theme.spec?.name ?? `#${theme.themeId}`;

  const unfollow = async () => {
    const outcome = await tx.run({ kind: "theme-unfollow", themeId: theme.themeId });
    if (outcome?.status === "confirmed") await invalidateThemes(queryClient);
  };
  const confirm = () => (session.address ? (following ? void unfollow() : undefined) : session.connectFor(F.signIn));
  const blocker = !session.address || following ? null : F.agentPending;

  return (
    <SlideOver open={open} onOpenChange={onOpenChange} urlKey="follow">
      <SlideOverContent title={F.title(name)} fields footer={<TxCta state={blocker ? { kind: "blocked", reason: blocker } : tx.state} action={!session.address ? F.signIn : following ? F.unfollow : THEMES.card.follow} signer={signerOf(session.kind)} sponsored onConfirm={confirm} />}>
        <div className="th-follow">
          <p className="type-body text-ink">{following ? F.unfollowLine : F.line}</p>
          {following ? null : (
            <>
              <Field label={F.allocation} value={allocation} onChange={setAllocation} />
              <button type="button" className="th-adjust" aria-expanded={adjust} onClick={() => setAdjust((a) => !a)}>{F.adjust}</button>
              {adjust ? (
                <div className="th-follow-caps">
                  <Field label={F.perTrade} value={perTrade} onChange={setPerTrade} />
                  <Field label={F.perDay} value={perDay} onChange={setPerDay} />
                </div>
              ) : null}
              <details className="th-signing">
                <summary>{F.signing}</summary>
                <p>{F.signingBody}</p>
              </details>
            </>
          )}
          {tx.state.kind === "failed" ? <TxFailureCard state={tx.state} onRetry={() => tx.dispatch({ type: "reset" })} /> : null}
        </div>
      </SlideOverContent>
    </SlideOver>
  );
}
