"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { HeaderAccount } from "@/components/shell/header/HeaderAccount";
import { ModeChip } from "@/components/shell/ModeChip";
import { BGM_BED, playSfx, setBgmVolume, setSfxVolume, useBgmVolume, useModalSfx, useSfxVolume } from "./audio";
import { GAMES } from "./copy";
import { fireFeedback, hapticsSupported } from "./feedback";
import { useGames } from "./GamesProvider";
import { ACCENT_CHOICES, ACCENT_LABELS, type MotionChoice } from "./settings";

const MOTION_ORDER: readonly MotionChoice[] = ["system", "full", "reduced"];

/**
 * The stage controls — Flicky's menu modal (`menu-modal.tsx`), on Mitoshi's one overlay (R4-9, D-227: Base UI's
 * Dialog, a bottom sheet under 768 px). The two volume wells, haptics, motion and accent; the credits are the foot
 * line. Each switch fires the cue it governs as it turns on, so the setting demonstrates itself. Vibration support is
 * reported, not assumed (iOS Safari has none).
 */
export function GameSettingsSheet() {
  const { settings, settingsOpen, setSettingsOpen, setHaptics, setMotion, setAccent, reducedMotion, feedback } = useGames();
  const [canVibrate, setCanVibrate] = useState(true);
  const sfxVolume = useSfxVolume();
  const bgmVolume = useBgmVolume();
  useModalSfx(settingsOpen);
  // Read after mount: `navigator` does not exist while rendering on the server.
  useEffect(() => setCanVibrate(hapticsSupported()), []);
  const close = () => setSettingsOpen(false);
  const motionLabel: Record<MotionChoice, string> = { system: GAMES.settings.motion.system, full: GAMES.settings.motion.full, reduced: GAMES.settings.motion.reduced };

  return (
    <Modal
      open={settingsOpen}
      onOpenChange={setSettingsOpen}
      title={GAMES.settings.title}
      className="gm-settings-modal"
      fields
      footer={
        <button type="button" className="du-cta gm-howto-got" onClick={close}>
          {GAMES.settings.close}
        </button>
      }
    >
      {/* The sheet portals out of the frame, so it carries the motion setting itself. */}
      <div className="gm-settings" data-reduced-motion={reducedMotion ? "true" : "false"}>
        {/* A phone's game screen has no top line (R6 games S06): the mode and the money are one tap away here. */}
        <div className="gm-set-account">
          <ModeChip />
          <HeaderAccount placement="top" />
        </div>
        <div className="gm-set-block">
          <label className="gm-set-row gm-set-row--stack">
            <span className="gm-set-label">{GAMES.settings.sfx.label}</span>
            <input
              type="range"
              className="gm-range"
              min={0}
              max={1}
              step={0.05}
              value={sfxVolume}
              aria-label={GAMES.settings.sfx.label}
              onChange={(event) => setSfxVolume(Number(event.target.value))}
              onPointerUp={() => playSfx("click")}
              onKeyUp={() => playSfx("click")}
            />
          </label>
          <label className="gm-set-row gm-set-row--stack">
            <span className="gm-set-label">{GAMES.settings.music.label}</span>
            <input
              type="range"
              className="gm-range"
              min={0}
              max={1}
              step={0.05}
              value={bgmVolume}
              aria-label={GAMES.settings.music.label}
              data-bed={BGM_BED}
              onChange={(event) => setBgmVolume(Number(event.target.value))}
            />
          </label>
        </div>

        <label className="gm-set-row">
          <span className="gm-set-text">
            <span className="gm-set-label">{GAMES.settings.haptics.label}</span>
            {canVibrate ? null : <span className="gm-set-hint">{GAMES.settings.hapticsUnsupported}</span>}
          </span>
          <Switch
            checked={settings.haptics}
            disabled={!canVibrate}
            onCheckedChange={(on) => {
              setHaptics(on);
              if (on) fireFeedback("confirm", { haptics: true });
            }}
          />
        </label>

        <div className="gm-set-row gm-set-row--stack">
          <span className="gm-set-label">{GAMES.settings.motion.label}</span>
          <div className="gm-seg" role="radiogroup" aria-label={GAMES.settings.motion.label}>
            {MOTION_ORDER.map((choice) => (
              <button
                key={choice}
                type="button"
                role="radio"
                aria-checked={settings.motion === choice}
                className="gm-seg-btn"
                data-on={settings.motion === choice}
                onClick={() => {
                  setMotion(choice);
                  feedback("tap");
                }}
              >
                {motionLabel[choice]}
              </button>
            ))}
          </div>
        </div>

        <div className="gm-set-row gm-set-row--stack">
          <span className="gm-set-label">{GAMES.settings.accent}</span>
          <div className="gm-seg" role="radiogroup" aria-label={GAMES.settings.accent}>
            {ACCENT_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                role="radio"
                aria-checked={settings.accent === choice}
                className="gm-seg-btn gm-seg-btn--accent"
                data-on={settings.accent === choice}
                data-accent={choice}
                onClick={() => {
                  setAccent(choice);
                  feedback("tap");
                }}
              >
                <span className="gm-seg-swatch" aria-hidden />
                {ACCENT_LABELS[choice]}
              </button>
            ))}
          </div>
        </div>

        <p className="gm-set-scope">{GAMES.settings.foot}</p>
      </div>
    </Modal>
  );
}
