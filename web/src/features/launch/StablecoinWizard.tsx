"use client";
// `/launch/stablecoin` (S17a; R4-11, D-227): a USD stablecoin in three steps on StudioWizard (21st 23576, as Owarine
// 90a91d71's DeskStudio). 1 Name — name, code and a hosted logo (21st 377), the currency locked to USD
// (checkStablecoinCurrency); 2 Supply — initial supply, cap and the DEX pair's two flip orders with what the bid
// escrows; 3 Review — "Can't be changed later", the typed currency (21st 25081's typed confirm), how a wallet will show
// it, then the creator's own nine-call batch (self-paid, D-063) and each call's proof read back from the receipt.
import { bidEscrow, DEX_MIN_ORDER, validateStablecoinLaunch, type StablecoinLaunchInput, type TxState } from "@cwf/core";
import { buildStablecoinBatch, memeAddresses, predictTokenAddress, randomSalt, readStablecoinReceipt, type StepProgress } from "@cwf/markets/launch";
import { invalidateLaunch, readReceipt } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { pillButtonVariants } from "@/components/kit";
import { signerOfKind as signerOf, TxCta, TxFailureCard, TypedConfirm, useTxLifecycle } from "@/components/tx";
import { ImageDropzone, type UploadedLogo } from "@/components/ui/image-dropzone";
import { StudioWizard } from "@/components/ui/wizard-steps";
import { useWalletSession } from "@/lib/wallet-session";
import { TEMPO_CHAIN_ID } from "@/providers/wallet/chain-id";
import { LAUNCH } from "./copy";
import { coinText, parseAmount, usdText } from "./format";
import { LogoDisc } from "./LogoDisc";
import { useNameFlag } from "./useNameFlag";
import "@/styles/launch.css";

const S = LAUNCH.stable;
const idleOr = (state: TxState, blocker: string | null): TxState => (blocker ? { kind: "blocked", reason: blocker } : state);
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Num({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="lp-field">
      <span>{label}</span>
      <input value={value} inputMode="decimal" onChange={(e) => onChange(e.target.value.replace(/[^0-9.\-]/g, ""))} className="numbers" />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function StablecoinWizard() {
  const session = useWalletSession();
  const queryClient = useQueryClient();
  const tx = useTxLifecycle();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [logo, setLogo] = useState<UploadedLogo | null>(null);
  const [supply, setSupply] = useState("10000");
  const [cap, setCap] = useState("0");
  const [bid, setBid] = useState("100");
  const [ask, setAsk] = useState("100");
  const [bidTick, setBidTick] = useState("-10");
  const [askTick, setAskTick] = useState("10");
  const [fee, setFee] = useState("10");
  const [typed, setTyped] = useState(false);
  const [salt] = useState(randomSalt);
  const [progress, setProgress] = useState<StepProgress[] | null>(null);
  const [launched, setLaunched] = useState<`0x${string}` | null>(null);
  const sym = code.trim().toUpperCase();
  const a = memeAddresses(TEMPO_CHAIN_ID === 4217 ? 4217 : 42431);

  const input: StablecoinLaunchInput = {
    name: name.trim(), symbol: sym, currency: "USD", logoURI: logo?.url ?? "", metadataURI: "",
    supplyCap: parseAmount(cap) ?? -1n, initialSupply: parseAmount(supply) ?? 0n, bidAmount: parseAmount(bid) ?? 0n, askAmount: parseAmount(ask) ?? 0n,
    bidTick: Number(bidTick), askTick: Number(askTick), feeLiquidity: parseAmount(fee) ?? 0n,
  };
  const errors = validateStablecoinLaunch(input);
  const flag = useNameFlag(`${name} ${sym}`);
  const identityBlocker = !input.name ? LAUNCH.meme.needName : !/^[A-Z][A-Z0-9]{1,10}$/.test(sym) ? S.codeRule : flag === null ? "…" : flag ? LAUNCH.meme.flagged : !logo ? LAUNCH.meme.needLogo : null;
  const supplyBlocker = input.supplyCap < 0n ? S.capRule : errors.find((e) => !e.startsWith("name") && !e.startsWith("symbol")) ?? null;
  const predicted = session.address ? predictTokenAddress(session.address, salt) : null;
  const escrow = input.bidAmount >= DEX_MIN_ORDER ? bidEscrow(input.bidAmount, input.bidTick) : null;

  const confirm = async () => {
    if (!session.address) return session.connectFor(S.signIn(sym));
    const outcome = await tx.run({ kind: "launch-stablecoin", input, salt });
    if (outcome?.status !== "confirmed" || !predicted) return;
    const batch = buildStablecoinBatch({ ...input, creator: session.address, salt, registry: a.registry });
    const receipt = await readReceipt(outcome.txHash).catch(() => null);
    if (receipt) setProgress(readStablecoinReceipt(batch, receipt));
    setLaunched(predicted);
    await invalidateLaunch(queryClient);
  };

  if (launched) {
    const done = progress?.filter((p) => p.done).length ?? 0;
    return (
      <section className="lp-page lp-done">
        <h1 className="type-display text-ink">{S.done(sym)}</h1>
        {progress ? (
          <>
            <p className="numbers type-caption text-ink-secondary">{S.progress(done, progress.length)}</p>
            <ol className="lp-steps">{progress.map((p) => <li key={p.step} data-done={p.done ? "" : undefined}>{p.step}</li>)}</ol>
          </>
        ) : null}
        <Link href={`/launch/${launched}`} className={pillButtonVariants({ tone: "accent", size: "lg", block: true })}>{LAUNCH.meme.open}</Link>
      </section>
    );
  }

  return (
    <section className="lp-page lp-wizard">
      <h1 className="type-display text-ink">{S.title}</h1>
      <div className="lp-studio-grid">
      <StudioWizard
        label={S.title}
        steps={[
          {
            id: "identity",
            label: S.steps.identity,
            blocker: identityBlocker,
            content: (
              <div className="lp-fields">
                <label className="lp-field"><span>{S.name}</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="off" /></label>
                <label className="lp-field"><span>{S.code}</span><input value={code} maxLength={11} onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} autoComplete="off" className="numbers" /><small>{S.currency}</small></label>
                <ImageDropzone value={logo} onChange={setLogo} label={LAUNCH.meme.logo} hint={LAUNCH.meme.logoHint} />
              </div>
            ),
          },
          {
            id: "supply",
            label: S.steps.supply,
            blocker: supplyBlocker ? cap1(supplyBlocker) : null,
            content: (
              <div className="lp-fields lp-grid2">
                <Num label={S.supply} value={supply} onChange={setSupply} />
                <Num label={S.cap} value={cap} onChange={setCap} />
                <Num label={S.bid} value={bid} onChange={setBid} hint={escrow !== null ? S.escrow(usdText(escrow)) : undefined} />
                <Num label={S.ask} value={ask} onChange={setAsk} />
                <Num label={S.bidTick} value={bidTick} onChange={setBidTick} />
                <Num label={S.askTick} value={askTick} onChange={setAskTick} />
                <Num label={S.fee} value={fee} onChange={setFee} />
              </div>
            ),
          },
          {
            id: "review",
            label: S.steps.review,
            blocker: null,
            content: (
              <div className="lp-fields">
                <p className="lp-warn">{S.locked}</p>
                <div className="lp-wallet-row" aria-label={S.preview}>
                  <LogoDisc uri={logo?.url ?? ""} symbol={sym || "?"} />
                  <span className="lp-row-id"><span className="lp-row-name">{input.name || "—"}</span><span className="lp-row-sym">{sym || "—"}</span></span>
                  <span className="lp-row-price numbers">{coinText(input.initialSupply)}</span>
                </div>
                <dl className="lp-review"><div><dt>{LAUNCH.meme.address}</dt><dd className="numbers lp-mono">{predicted ?? "—"}</dd></div></dl>
                <TypedConfirm code="USD" onMatch={setTyped} />
                <TxCta state={idleOr(tx.state, identityBlocker ?? (supplyBlocker ? cap1(supplyBlocker) : null) ?? (typed ? null : S.typeCode("USD")))} action={session.address ? S.action(sym) : S.signIn(sym)} signer={signerOf(session.kind)} onConfirm={() => void confirm()} />
                <p className="type-caption text-ink-secondary">{S.selfPaid}</p>
                {tx.state.kind === "failed" ? <TxFailureCard state={tx.state} onRetry={() => tx.dispatch({ type: "reset" })} /> : null}
              </div>
            ),
          },
        ]}
      />
      <aside className="lp-side" aria-label={S.preview}>
        <LogoDisc uri={logo?.url ?? ""} symbol={sym || "?"} size="lg" />
        <span className="lp-row-name">{input.name || "—"}</span>
        <span className="lp-row-sym">{sym || "—"} · USD</span>
        <span className="numbers type-caption text-ink-secondary">{S.supply} {coinText(input.initialSupply)}</span>
        {escrow !== null ? <span className="numbers type-caption text-ink-secondary">{S.escrow(usdText(escrow))}</span> : null}
      </aside>
      </div>
    </section>
  );
}
