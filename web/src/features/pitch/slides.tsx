"use client";
// Ported from Masayume 52a86fc:web/src/features/pitch/slides.tsx unchanged.

import { PITCH } from "./copy";
import { Emph, Glance, Kicker, Mono, PhaseCard, Rise } from "./primitives";
import type { Slide } from "./types";

/**
 * The three slides — layouts from `reference/yosuku/app/pitch/page.tsx` (cover, edge,
 * roadmap), cut down for a five-minute live showcase where the app does the showing.
 */

const H = PITCH.hello;
const I = PITCH.idea;
const N = PITCH.ahead;

export const SLIDES: Slide[] = [
  // 01 · HELLO — the opening line, and who built it
  {
    id: "hello",
    section: H.section,
    render: () => (
      <div className="pitch-row pitch-row-between">
        <div className="pitch-col pitch-col-52">
          <Kicker>{H.kicker}</Kicker>
          <Rise i={1} className="pitch-h1 pitch-h1-cover">
            {H.h1a}
            <br />
            {H.h1b}
            <Emph delay={0.7}>{H.emph}</Emph>.
          </Rise>
          <Rise i={2} className="pitch-lead pitch-lead-50">
            {H.lead} <span className="ink">{H.leadStrong}</span>
          </Rise>
        </div>
        <Glance
          i={3}
          title={H.glanceTitle}
          badge={H.glanceBadge}
          rows={[[H.rows.builder[0], H.rows.builder[1], true], H.rows.alias]}
        />
      </div>
    ),
  },

  // 02 · THE IDEA — also the map of the walkthrough that follows
  {
    id: "idea",
    section: I.section,
    paper: 2,
    render: () => (
      <div className="pitch-stack">
        <Kicker>{I.kicker}</Kicker>
        <Rise i={1} className="pitch-h1 pitch-h1-art">
          {I.h1a}
          <br />
          {I.h1b}
          <Emph delay={0.85}>{I.emph}</Emph>.
        </Rise>
        <Rise i={2} className="pitch-lead pitch-lead-66">
          {I.lead}
        </Rise>
        <Rise i={3} className="pitch-cells-wrap">
          <div className="pitch-cells">
            {I.cells.map(([n, l]) => (
              <div key={n} className="pitch-cell">
                <div className="pitch-cell-name">{n}</div>
                <div className="pitch-cell-label">{l}</div>
              </div>
            ))}
          </div>
          <Mono className="pitch-cells-note" tone="live">
            {I.foot}
          </Mono>
        </Rise>
      </div>
    ),
  },

  // 03 · WHAT'S NEXT — shown after the walkthrough
  {
    id: "next",
    section: N.section,
    render: () => (
      <div className="pitch-stack">
        <Kicker>{N.kicker}</Kicker>
        <Rise i={1} className="pitch-h1 pitch-h1-art">
          {N.h1a}
          <Emph delay={0.8}>{N.emph}</Emph>.
        </Rise>
        <div className="pitch-phases">
          <PhaseCard i={2} tone="live" tag={N.now.tag} title={N.now.title} body={N.now.body} />
          <PhaseCard i={3} tag={N.later.tag} title={N.later.title} body={N.later.body} />
          <PhaseCard i={4} tag={N.then.tag} title={N.then.title} body={N.then.body} />
        </div>
        <Rise i={5} className="pitch-roadmap-foot">
          <Mono tone="live">{N.foot}</Mono>
        </Rise>
      </div>
    ),
  },
];
