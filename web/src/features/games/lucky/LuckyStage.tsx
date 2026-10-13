"use client";

// /games/lucky — the machine (R4-9, D-227; Owarine 90a91d71:web/src/features/games/lucky/LuckyStage.tsx's cabinet,
// Masayume 68f7a09's draw, Senryo's "Lucky becomes a machine"). Three reels land on a live Window, a side and a reach;
// the stake is one of four chips; SPIN commits and reveals; the deal card shows the live quote and the lever places the
// one real call. The draw's proof — commitment, both seeds, the candidate set — sits behind ⓘ, recomputed here.
// Signed out, SPIN opens sign-in for that spin (the CTA is the action).
import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { useWalletSession } from "@/lib/wallet-session";
import { startBgm, stopBgm } from "../audio";
import { useImmersive, useGames } from "../GamesProvider";
import { LUCKY } from "./copy";
import { LuckyDeal } from "./LuckyDeal";
import { useLuckyHistory } from "./LuckyHistory";
import { LuckyReels } from "./LuckyReels";
import type { LuckyDealWire } from "./lucky-wire";
import { reelSpin } from "./reel-sfx";
import { useLuckyDraw, verifyDeal } from "./useLuckyDraw";
import "./lucky.css";

/** The four chips, in pathUSD base units (6 decimals): $1, $5, $10, $25. */
const CHIPS: readonly { dollars: number; base: bigint }[] = [
  { dollars: 1, base: 1_000_000n },
  { dollars: 5, base: 5_000_000n },
  { dollars: 10, base: 10_000_000n },
  { dollars: 25, base: 25_000_000n },
];

function Proof({ deal, wallet }: { deal: LuckyDealWire; wallet: string }) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void verifyDeal(deal, wallet as `0x${string}`).then((v) => alive && setOk(v), () => alive && setOk(false));
    return () => {
      alive = false;
    };
  }, [deal, wallet]);
  return (
    <details className="lk-proof">
      <summary>
        <Info aria-hidden className="lk-proof-icon" />
        {LUCKY.proof.open}
        {ok !== null ? <span className="lk-proof-verdict" data-ok={ok || undefined}>{ok ? LUCKY.proof.verified : LUCKY.proof.mismatch}</span> : null}
      </summary>
      <dl className="lk-kv">
        <dt>{LUCKY.proof.commitment}</dt>
        <dd>{deal.commitment}</dd>
        <dt>{LUCKY.proof.serverSeed}</dt>
        <dd>{deal.serverSeed}</dd>
        <dt>{LUCKY.proof.clientSeed}</dt>
        <dd>{deal.clientSeed}</dd>
        <dt>{LUCKY.proof.nonce}</dt>
        <dd>{deal.nonce}</dd>
        <dt>{LUCKY.proof.set}</dt>
        <dd>{LUCKY.proof.candidates(deal.candidateCount, deal.candidateHash)}</dd>
      </dl>
    </details>
  );
}

export function LuckyStage() {
  const { address, connectFor } = useWalletSession();
  const { feedback } = useGames();
  const draw = useLuckyDraw();
  const history = useLuckyHistory(address);
  const [chip, setChip] = useState(1);
  const busy = draw.phase === "spinning" || draw.phase === "landing";
  useImmersive(draw.phase !== "idle" && draw.phase !== "error");
  useEffect(() => () => stopBgm(), []);

  const spin = () => {
    if (!address) return connectFor(LUCKY.signIn);
    feedback("tap");
    startBgm();
    reelSpin();
    void draw.spin(CHIPS[chip]!.base);
  };

  const target = draw.deal && draw.phase !== "spinning" ? draw.deal.draw : null;

  return (
    <div className="gm-page lk-stage">
      <section className="lk-cabinet" aria-label={LUCKY.title}>
        <span className="lk-lights" aria-hidden />
        <LuckyReels cycling={draw.phase === "spinning"} landing={draw.phase === "landing"} target={target} onLanded={draw.landed} />
      </section>

      {draw.phase === "dealt" && draw.deal && address ? (
        <LuckyDeal deal={draw.deal} wallet={address} onAgain={draw.reset} />
      ) : (
        <>
          <div className="lk-chips" role="radiogroup" aria-label={LUCKY.stake}>
            {CHIPS.map((c, i) => (
              <button key={c.dollars} type="button" role="radio" aria-checked={chip === i} className="lk-chip" data-on={chip === i || undefined} disabled={busy} onClick={() => setChip(i)}>
                {LUCKY.chip(c.dollars)}
              </button>
            ))}
          </div>
          <button type="button" className={`lk-cta${busy ? " lk-cta--busy" : ""}`} disabled={busy} onClick={spin} data-primary-action>
            {busy ? LUCKY.spinning : draw.phase === "refused" ? LUCKY.again : LUCKY.spin}
          </button>
          {history.data && history.data.best > 0 ? <p className="lk-note lk-streak">{LUCKY.streak(history.data.streak, history.data.best)}</p> : null}
          {draw.phase === "refused" && draw.deal ? <p className="lk-note">{LUCKY.refused(draw.deal.refusal ?? "")}</p> : null}
          {draw.phase === "error" && draw.error ? <p className="lk-note">{draw.error}</p> : null}
        </>
      )}

      {draw.deal && address && (draw.phase === "dealt" || draw.phase === "refused") ? <Proof deal={draw.deal} wallet={address} /> : null}
    </div>
  );
}
