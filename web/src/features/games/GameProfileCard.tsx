"use client";

import { shortHex } from "@cwf/core/units";
import type { CSSProperties } from "react";
import { LoadingState } from "@/components/states";
import { addressHue } from "@/lib/address-hue";
import { useWalletSession } from "@/lib/wallet-session";
import { GAMES } from "./copy";
import { useGames } from "./GamesProvider";

/**
 * Who you are in the games.
 *
 * Everything shown here is already true: the address is the wallet that signs the orders, the ring
 * is this app's own deterministic hue for it, and the accent is a choice the player just made. The
 * rating, the record and the streak are written by the arena and its projector, and neither exists
 * — so they read as unrecorded, with one line saying why. A zero would claim a ladder had looked at
 * this player and placed them at the bottom.
 */
export function GameProfileCard() {
  const { address, isConnected } = useWalletSession();
  const { settings, hydrated } = useGames();

  // Whether a wallet is connected is a client-only fact: the server renders signed out, and an
  // injected wallet reconnects during hydration. Rendering either answer before the client has one
  // is a hydration mismatch, and React then throws away and rebuilds this subtree. `hydrated` flips
  // in the settings store's own post-mount effect, so it is exactly "the client has answered".
  if (!hydrated) {
    return (
      <div className="gm-plate gm-profile">
        <LoadingState shape="row" label="Reading your games profile" />
      </div>
    );
  }

  if (!isConnected || !address) {
    return (
      <div className="gm-plate gm-profile gm-profile--out">
        <p className="gm-plate-title">{GAMES.profile.signedOut.title}</p>
        <p className="gm-plate-body">{GAMES.profile.signedOut.body}</p>
      </div>
    );
  }

  const style = { "--gm-hue": addressHue(address) } as CSSProperties;
  return (
    <div className="gm-plate gm-profile">
      <div className="gm-profile-id">
        <span className="gm-avatar" data-accent={settings.accent} style={style} aria-hidden />
        <span className="gm-profile-name">
          <span className="gm-profile-you">{GAMES.profile.you}</span>
          <span className="numbers gm-profile-addr" title={address}>
            {shortHex(address)}
          </span>
        </span>
      </div>

      <dl className="gm-stats">
        <Stat label={GAMES.profile.rating} />
        <Stat label={GAMES.profile.record} />
        <Stat label={GAMES.profile.streak} />
      </dl>

      <p className="gm-plate-note">{GAMES.profile.pending}</p>
    </div>
  );
}

function Stat({ label }: { label: string }) {
  return (
    <div className="gm-stat">
      <dt className="gm-stat-label">{label}</dt>
      <dd className="gm-stat-value">{GAMES.profile.unrecorded}</dd>
    </div>
  );
}
