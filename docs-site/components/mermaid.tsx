'use client';
// Ported from Owarine 90a91d71:docs-site/components/mermaid.tsx (D-227): theme-aware diagrams in Mitoshi's palette
// (vermilion lines on the dark ground, the cream light theme), the source always one tap away.
import { useEffect, useId, useState } from 'react';
import { useTheme } from 'next-themes';

// Mermaid keeps global configuration. Serialise configuration and rendering so charts in
// different themes cannot borrow another chart's palette during a navigation or theme change.
let pending: Promise<unknown> = Promise.resolve();

const PALETTE = {
  dark: { ground: '#0A0A0A', node: '#171717', ink: '#FFFFFF', muted: '#A3A3A3', line: '#E04D26', cluster: '#0F0F0F', border: '#404040', up: '#34D399', upWash: '#0B2A20', note: '#1F1410' },
  light: { ground: '#FBF7EE', node: '#FFFFFF', ink: '#141210', muted: '#5E574B', line: '#B83214', cluster: '#F4EEE3', border: '#C4BAA6', up: '#2E6B4F', upWash: '#E3EFE7', note: '#F8E6DE' },
} as const;

export function Mermaid({ chart, title = 'Architecture diagram' }: { chart: string; title?: string }) {
  const { resolvedTheme } = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [result, setResult] = useState<{ key: string; svg?: string; failed?: boolean }>();
  const key = `${resolvedTheme}:${chart}`;

  useEffect(() => {
    if (!resolvedTheme) return;
    let cancelled = false;
    const dark = resolvedTheme === 'dark';
    const c = dark ? PALETTE.dark : PALETTE.light;
    const render = async () => {
      const mermaid = (await import('mermaid')).default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        look: 'classic',
        fontFamily: 'Inter, system-ui, sans-serif',
        flowchart: { htmlLabels: false, curve: 'basis', padding: 18 },
        themeVariables: {
          darkMode: dark,
          background: c.ground,
          primaryColor: c.node,
          primaryTextColor: c.ink,
          primaryBorderColor: c.line,
          secondaryColor: c.upWash,
          secondaryTextColor: c.ink,
          secondaryBorderColor: c.up,
          tertiaryColor: c.cluster,
          tertiaryTextColor: c.ink,
          tertiaryBorderColor: c.border,
          lineColor: c.line,
          textColor: c.ink,
          edgeLabelBackground: c.ground,
          clusterBkg: c.cluster,
          clusterBorder: c.border,
          actorBkg: c.node,
          actorBorder: c.line,
          actorTextColor: c.ink,
          actorLineColor: c.muted,
          signalColor: c.ink,
          signalTextColor: c.ink,
          labelBoxBkgColor: c.node,
          labelTextColor: c.ink,
          loopTextColor: c.ink,
          noteBkgColor: c.note,
          noteTextColor: c.ink,
          noteBorderColor: c.line,
        },
      });
      const { svg } = await mermaid.render(`mitoshi-${id}`, chart);
      if (!cancelled) setResult({ key, svg });
    };
    pending = pending.catch(() => undefined).then(render).catch(() => {
      if (!cancelled) setResult({ key, failed: true });
    });
    return () => { cancelled = true; };
  }, [chart, id, key, resolvedTheme]);

  const current = result?.key === key ? result : undefined;
  const sequence = chart.trimStart().startsWith('sequenceDiagram');
  return (
    <figure className="mermaid-diagram not-prose" aria-label={title}>
      <figcaption>{title}</figcaption>
      {current?.svg
        ? <div className={`mermaid-scroll${sequence ? ' mermaid-sequence' : ''}`} tabIndex={0} role="img" aria-label={`${title}. Scroll sideways to read the whole diagram.`} dangerouslySetInnerHTML={{ __html: current.svg }} />
        : <p role="status">{current?.failed ? 'The diagram could not render. Its source is below.' : 'Loading diagram…'}</p>}
      <details><summary>Read diagram source</summary><pre><code>{chart}</code></pre></details>
    </figure>
  );
}
