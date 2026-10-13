"use client";
// `/settings/device` (R6 money, S21; D-230): what belongs to this phone or browser, signed in or not — Sound & Vibration
// (S22.6's toggles, and Face ID inside the app), Privacy (the balance eye as a toggle) and Region (what this connection
// may trade, in words, and why: where you connect from). Split out of /settings/account, so the account page is the
// account's and this page works for everyone. Apple's grouped lists with a footer line where a setting gates something.
import { useEffect, useState } from "react";
import type { RegionPosture } from "@cwf/core";
import { GroupedList, GroupedToggle } from "@/components/kit/GroupedList";
import { setPrivacy, usePrivacy } from "@/lib/privacy";
import { readRegionPosture } from "@/lib/region-mark";
import { ACCOUNT_PAGE } from "./copy";
import { FeedbackRows } from "./FeedbackSection";
import "@/components/kit/kit.css";

const P = ACCOUNT_PAGE;

export function DeviceSettings() {
  const hidden = usePrivacy();
  const [posture, setPosture] = useState<RegionPosture | null>(null);
  useEffect(() => setPosture(readRegionPosture()), []);
  const held = posture ? (Object.keys(P.region.pillar) as (keyof typeof P.region.pillar)[]).filter((p) => posture[p] === "restricted") : [];
  return (
    <section className="acct-page">
      <GroupedList title={P.groups.device}>
        <FeedbackRows />
      </GroupedList>
      <GroupedList title={P.groups.privacy}>
        <GroupedToggle label={P.privacy.label} sub={P.privacy.hint} checked={hidden} onChange={setPrivacy} />
      </GroupedList>
      <GroupedList title={P.groups.region} foot={P.region.foot}>
        <div className="kit-item">
          <span className="kit-item-label">{P.region.title}</span>
          <span className="kit-item-detail">{posture === null ? "—" : held.length === 0 ? P.region.open : P.region.restricted(held.map((p) => P.region.pillar[p]).join(", "))}</span>
        </div>
      </GroupedList>
    </section>
  );
}
