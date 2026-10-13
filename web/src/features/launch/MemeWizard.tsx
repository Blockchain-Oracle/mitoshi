"use client";
// `/launch/meme` (S17; R4-11, D-227): a memecoin in three steps on StudioWizard (21st 23576, as Owarine 90a91d71's
// DeskStudio: numbered steps, one signature at the end). 1 Name — name, ticker (checkMemecoinCurrency and the word
// filter, live) and a hosted logo (21st 377); 2 Curve — the launchpad's published templates, each with its price range,
// graduation threshold and anti-snipe fee curve, read from the chain; 3 Review — the predicted address and an optional
// creator buy within the template's cap, then `launch-meme-create` through the TxLifecycle. Sign-in comes at the CTA.
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { templateCards } from "@/components/states/shapes/launch";
import { checkMemecoinCurrency, quoteBuy, type TxState } from "@cwf/core";
import { feeTimeline, memeAddresses, predictMemecoinAddress, randomSalt, withSlippage, type MemeTemplate } from "@cwf/markets/launch";
import { invalidateLaunch, useMemeTemplates } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { pillButtonVariants } from "@/components/kit/PillButton";
import { Sparkline } from "@/components/kit/desk-kit";
import { signerOfKind as signerOf, TxCta, TxFailureCard, useTxLifecycle } from "@/components/tx";
import { ImageDropzone, type UploadedLogo } from "@/components/ui/image-dropzone";
import { StudioWizard } from "@/components/ui/wizard-steps";
import { useWalletSession } from "@/lib/wallet-session";
import { cn } from "@/lib/utils";
import { TEMPO_CHAIN_ID } from "@/providers/wallet/chain-id";
import { LAUNCH } from "./copy";
import { bpsText, coinText, parseAmount, priceText, usdText } from "./format";
import { LogoDisc } from "./LogoDisc";
import { useNameFlag } from "./useNameFlag";
import "@/styles/launch.css";
import "@/components/kit/kit.css";

const M = LAUNCH.meme;
const SLIPPAGE_BPS = 100;
const idleOr = (state: TxState, blocker: string | null): TxState => (blocker ? { kind: "blocked", reason: blocker } : state);

function TemplateCard({ t, on, onPick }: { t: MemeTemplate; on: boolean; onPick: () => void }) {
  const curve = feeTimeline(t.fees, 32);
  const last = curve.at(-1);
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onPick} className={cn("lp-template", on && "is-on")}>
      <span className="lp-template-head">
        <span className="type-body-strong text-ink">{M.template(t.configId)}</span>
        <span className="lp-chip numbers">{M.graduates(usdText(t.migrationQuoteThreshold))}</span>
      </span>
      <span className="numbers type-caption text-ink-secondary">{M.priceRange(priceText(t.startPriceE18), priceText(t.endPriceE18))}</span>
      <Sparkline values={curve.map(([, bps]) => bps)} tone="down" className="lp-template-spark" />
      <span className="numbers type-caption text-ink-secondary">{M.antiSnipe(bpsText(t.fees.start), bpsText(t.fees.base), last ? last[0] : 0)}</span>
    </button>
  );
}

export function MemeWizard() {
  const session = useWalletSession();
  const templates = useMemeTemplates();
  const queryClient = useQueryClient();
  const tx = useTxLifecycle();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [logo, setLogo] = useState<UploadedLogo | null>(null);
  const [configId, setConfigId] = useState<number | null>(null);
  const [buyText, setBuyText] = useState("");
  const [salt] = useState(randomSalt);
  const [launched, setLaunched] = useState<{ token: `0x${string}`; symbol: string } | null>(null);
  const flag = useNameFlag(`${name} ${symbol}`);
  const list = templates?.ok ? templates.value : [];
  const template = list.find((t) => t.configId === configId) ?? (list.length === 1 ? list[0]! : null);
  const a = memeAddresses(TEMPO_CHAIN_ID === 4217 ? 4217 : 42431);
  const predicted = session.address ? predictMemecoinAddress(a.launchpad, session.address, salt) : null;
  const sym = symbol.trim().toUpperCase();

  const guard = checkMemecoinCurrency(sym);
  const identityBlocker = !name.trim() ? M.needName : !sym ? M.needSymbol : !guard.ok ? guard.reason : flag === null ? "…" : flag ? M.flagged : !logo ? M.needLogo : null;
  const buyBase = buyText.trim() ? parseAmount(buyText) : 0n;
  const buy = useMemo(() => {
    if (!template || buyBase === null || buyBase <= 0n) return null;
    const q = quoteBuy({ segments: template.segments, sqrtStartX96: template.sqrtStartX96, sqrtEndX96: template.sqrtEndX96 }, { sqrtPriceX96: template.sqrtStartX96, segment: 0 }, BigInt(template.fees.base), buyBase);
    return { coinOut: q.coinOut, cap: (template.curveSupply * BigInt(template.maxCreatorBuyBps)) / 10_000n };
  }, [template, buyBase]);
  const reviewBlocker = buyBase === null ? LAUNCH.trade.enter : buy && buy.coinOut > buy.cap ? M.creatorBuyMax(bpsText(template!.maxCreatorBuyBps)) : null;

  const confirm = async () => {
    if (!session.address) return session.connectFor(M.signIn(sym));
    if (!template || !logo || !predicted) return;
    const outcome = await tx.run({ kind: "launch-meme-create", configId: template.configId, name: name.trim(), symbol: sym, logoURI: logo.url, metadataURI: "", salt, creatorBuyQuote: buyBase ?? 0n, minCoinOut: buy ? withSlippage(buy.coinOut, SLIPPAGE_BPS) : 0n });
    if (outcome?.status === "confirmed") {
      setLaunched({ token: predicted, symbol: sym });
      await invalidateLaunch(queryClient);
    }
  };

  if (launched) {
    return (
      <section className="lp-page lp-done">
        <h1 className="type-display text-ink">{M.done(launched.symbol)}</h1>
        <p className="numbers type-caption text-ink-secondary">{launched.token}</p>
        <Link href={`/launch/${launched.token}`} className={pillButtonVariants({ tone: "accent", size: "lg", block: true })}>{M.open}</Link>
      </section>
    );
  }

  return (
    <section className="lp-page lp-wizard">
      <h1 className="type-display text-ink">{M.title}</h1>
      <div className="lp-studio-grid">
      <StudioWizard
        label={M.title}
        steps={[
          {
            id: "identity",
            label: M.steps.identity,
            blocker: identityBlocker,
            content: (
              <div className="lp-fields">
                <label className="lp-field">
                  <span>{M.name}</span>
                  <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="off" />
                </label>
                <label className="lp-field">
                  <span>{M.symbol}</span>
                  <input value={symbol} maxLength={8} onChange={(e) => setSymbol(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} autoComplete="off" className="numbers" />
                </label>
                <ImageDropzone value={logo} onChange={setLogo} label={M.logo} hint={M.logoHint} />
              </div>
            ),
          },
          {
            id: "curve",
            label: M.steps.curve,
            blocker: template ? null : M.needTemplate,
            content: (
              <div role="radiogroup" aria-label={M.steps.curve} className="lp-templates">
                {templates === null ? <LoadingFrame shape="template-cards" layout="contents">{templateCards()}</LoadingFrame> : null}
                {list.map((t) => <TemplateCard key={t.configId} t={t} on={template?.configId === t.configId} onPick={() => setConfigId(t.configId)} />)}
              </div>
            ),
          },
          {
            id: "review",
            label: M.steps.review,
            blocker: null,
            content: (
              <div className="lp-fields">
                <dl className="lp-review">
                  <div><dt>{M.name}</dt><dd>{name} · ${sym}</dd></div>
                  {template ? <div><dt>{M.steps.curve}</dt><dd className="numbers">{M.priceRange(priceText(template.startPriceE18), priceText(template.endPriceE18))}</dd></div> : null}
                  <div><dt>{M.address}</dt><dd className="numbers lp-mono">{predicted ?? "—"}</dd></div>
                </dl>
                <label className="lp-field">
                  <span>{M.creatorBuy}</span>
                  <input value={buyText} inputMode="decimal" placeholder="0.00" onChange={(e) => setBuyText(e.target.value.replace(/[^0-9.]/g, ""))} className="numbers" />
                  <small>{buy ? `≈ ${coinText(buy.coinOut)} $${sym} · ${M.creatorBuyMax(bpsText(template!.maxCreatorBuyBps))}` : template ? M.creatorBuyMax(bpsText(template.maxCreatorBuyBps)) : null}</small>
                </label>
                <TxCta state={idleOr(tx.state, identityBlocker ?? (template ? reviewBlocker : M.needTemplate))} action={session.address ? M.action(sym || "…") : M.signIn(sym || "…")} signer={signerOf(session.kind)} sponsored onConfirm={() => void confirm()} />
                {tx.state.kind === "failed" ? <TxFailureCard state={tx.state} onRetry={() => tx.dispatch({ type: "reset" })} /> : null}
              </div>
            ),
          },
        ]}
      />
      <aside className="lp-side" aria-label={M.steps.review}>
        <LogoDisc uri={logo?.url ?? ""} symbol={sym || "?"} size="lg" />
        <span className="lp-row-name">{name.trim() || "—"}</span>
        <span className="lp-row-sym">${sym || "—"}</span>
        {template ? <span className="numbers type-caption text-ink-secondary">{M.priceRange(priceText(template.startPriceE18), priceText(template.endPriceE18))}</span> : null}
        {template ? <span className="numbers type-caption text-ink-secondary">{M.graduates(usdText(template.migrationQuoteThreshold))}</span> : null}
      </aside>
      </div>
    </section>
  );
}
