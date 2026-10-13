"use client";
// The phone app's first screen (round 7, the owner's TestFlight review: "the onboarding flow sucks"; Senryo
// apps/mobile/src/app/welcome.tsx + features/onboarding/Story.tsx + features/auth/WelcomeActions.tsx are the model).
// A five-scene story — auto-advancing, swipeable, a tick on each scene — over three actions pinned in the thumb zone:
// Create account (the passkey ceremony right on this tap, so the system sheet opens at once), I have an account, and
// Look around (paper trading on Markets). A new account is funded by the shell (ACCOUNT_CREATED_EVENT); inside the app
// it is offered Face ID to open, then lands on the terminal for its first call. The proxy sends a first-time app user
// here (proxy.ts, the `cwf_welcomed` cookie this sets).
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { setTradeSettings } from "@/features/terminal/settings";
import { ACCOUNT_CREATED_EVENT } from "@/features/funding/credited";
import { WELCOMED_COOKIE } from "@/lib/app-shell";
import { haptic } from "@/lib/haptics";
import { useFaceIdLock } from "@/lib/use-face-id-lock";
import { SIGN_IN } from "@/providers/wallet/copy";
import { passkeyFailure } from "@/providers/wallet/passkey-errors";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import { WELCOME } from "./copy";
import { SceneArt } from "./SceneArt";
import "@/styles/welcome.css";

const SCENE_MS = 5_000;
const SWIPE_PX = 40;

function markWelcomed(): void {
  try {
    document.cookie = `${WELCOMED_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  } catch {
    /* a cookie-less view still leaves; it would just see the story again */
  }
  // The story already said how a call works: the terminal's five-step tour would say it twice.
  setTradeSettings({ tutorialSeen: true });
}

export function WelcomeScreen() {
  const router = useRouter();
  const shell = useWalletShell();
  const faceId = useFaceIdLock();
  const [at, setAt] = useState(0);
  const [held, setHeld] = useState(false);
  const [busy, setBusy] = useState<"create" | "signin" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [offerFaceId, setOfferFaceId] = useState(false);
  const startX = useRef<number | null>(null);
  const count = WELCOME.scenes.length;
  const scene = WELCOME.scenes[at]!;

  const go = useCallback((next: number) => {
    setAt((cur) => {
      const to = (next + count) % count;
      if (to !== cur) haptic("tick");
      return to;
    });
  }, [count]);

  // The wallet runtime loads while the story plays, so a tap on Create account opens the system sheet at once.
  const { prepare } = shell;
  useEffect(() => prepare(), [prepare]);

  // Auto-advance until the reader takes over (a swipe, a dot) or a ceremony runs; none under reduced motion.
  useEffect(() => {
    if (held || busy || offerFaceId) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setTimeout(() => go(at + 1), SCENE_MS);
    return () => window.clearTimeout(t);
  }, [at, held, busy, offerFaceId, go]);

  const leave = useCallback((to: string) => {
    markWelcomed();
    router.replace(to);
  }, [router]);

  const create = async () => {
    setBusy("create");
    setNote(null);
    const result = await shell.createPasskey();
    setBusy(null);
    if (result.ok) {
      haptic("open");
      window.dispatchEvent(new CustomEvent(ACCOUNT_CREATED_EVENT, { detail: { forOrder: false } }));
      if (faceId?.available && !faceId.on) setOfferFaceId(true);
      else leave("/trade/BTC");
      return;
    }
    if (result.aborted) return;
    const failure = passkeyFailure(result.error);
    setNote(failure ? `${SIGN_IN.failures[failure].headline}. ${SIGN_IN.failures[failure].body}` : SIGN_IN.retry);
    haptic("warn");
  };

  const signIn = async () => {
    setBusy("signin");
    setNote(null);
    const result = await shell.signInPasskey();
    setBusy(null);
    if (result.ok) return leave("/markets");
    setNote(result.aborted ? SIGN_IN.noneChosen : SIGN_IN.retry);
  };

  const onDown = (e: PointerEvent) => {
    startX.current = e.clientX;
  };
  const onUp = (e: PointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) < SWIPE_PX) return;
    setHeld(true);
    go(dx < 0 ? at + 1 : at - 1);
  };

  if (offerFaceId) {
    return (
      <div className="welcome welcome--faceid">
        <div className="wl-stage">
          <SceneArt scene="key" />
        </div>
        <div className="wl-words">
          <h1 className="wl-title">{WELCOME.faceId.title}</h1>
          <p className="wl-body">{WELCOME.faceId.body}</p>
        </div>
        <div className="wl-actions">
          <button type="button" className="wl-btn wl-btn--accent" onClick={() => (faceId?.set(true), leave("/trade/BTC"))}>{WELCOME.faceId.on}</button>
          <button type="button" className="wl-btn wl-btn--ghost" onClick={() => leave("/trade/BTC")}>{WELCOME.faceId.later}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="welcome">
      <div className="wl-stage" onPointerDown={onDown} onPointerUp={onUp} role="group" aria-roledescription="carousel" aria-label={WELCOME.scene(at + 1, count)}>
        <div key={scene.key} className="wl-scene">
          <SceneArt scene={scene.key} />
        </div>
      </div>
      <div className="wl-words" aria-live="polite">
        <h1 key={`t-${scene.key}`} className="wl-title">{scene.title}</h1>
        <p key={`b-${scene.key}`} className="wl-body">{scene.body}</p>
      </div>
      <div className="wl-dots">
        {WELCOME.scenes.map((s, i) => (
          <button key={s.key} type="button" className="wl-dot-btn" aria-label={WELCOME.scene(i + 1, count)} aria-current={i === at ? "step" : undefined} onClick={() => (setHeld(true), go(i))} />
        ))}
      </div>
      <div className="wl-actions">
        <button type="button" className="wl-btn wl-btn--accent" disabled={busy !== null || !shell.runtime} onClick={() => void create()}>
          {busy === "create" ? WELCOME.creating : WELCOME.create}
        </button>
        <button type="button" className="wl-btn" disabled={busy !== null || !shell.runtime} onClick={() => void signIn()}>
          {busy === "signin" ? WELCOME.signingIn : WELCOME.signIn}
        </button>
        <button type="button" className="wl-link" disabled={busy !== null} onClick={() => leave("/markets")}>{WELCOME.look}</button>
        {note ? <p className="wl-note" role="status">{note}</p> : null}
      </div>
    </div>
  );
}
