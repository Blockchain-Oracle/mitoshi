'use client';
// Ported from Owarine 90a91d71:docs-site/components/architecture.tsx (D-227): three rows of four stages; choose one to
// read its responsibility and its authority boundary. Data: `lib/architecture.json`; the SVG export is generated from it.
import { useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import graphs from '@/lib/architecture.json';
import { Brand } from './brand';

type GraphName = keyof typeof graphs;

export function Architecture({ name }: { name: GraphName }) {
  const graph = graphs[name];
  const [selected, setSelected] = useState<[number, number]>([0, 0]);
  const node = graph.rows[selected[0]].nodes[selected[1]];
  return (
    <figure className="architecture not-prose" aria-label={graph.title}>
      <div className="guide-top"><span>{graph.title}</span><Brand small /></div>
      <div className="architecture-intro"><p>{graph.subtitle}</p><small>Choose a stage to read what it does and what it cannot do.</small></div>
      <div className="architecture-scroll"><div className="architecture-grid">
        {graph.rows.map((row, r) => (
          <section key={row.label} className="architecture-row" aria-label={row.label}>
            <h3>{row.label}</h3>
            <div className="architecture-chain">
              {row.nodes.map((item, c) => (
                <div className="architecture-step" key={`${r}-${c}`}>
                  <button type="button" aria-pressed={selected[0] === r && selected[1] === c} onClick={() => setSelected([r, c])}>
                    <span className="architecture-number">{r + 1}.{c + 1}</span>
                    <strong>{item.title}</strong><small>{item.subtitle}</small>
                  </button>
                  {c < row.arrows.length && <div className="architecture-arrow" aria-label={row.arrows[c]}><span>{row.arrows[c]}</span><b aria-hidden="true">→</b></div>}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div></div>
      <div className="architecture-detail" aria-live="polite">
        <div><small>STAGE {selected[0] + 1}.{selected[1] + 1}</small><h3>{node.title}</h3><p>{node.detail}</p></div>
        <div><small>AUTHORITY BOUNDARY</small><p>{node.authority}</p></div>
      </div>
      <figcaption>
        <p>{graph.note}</p>
        <a href={`/diagrams/${name}.svg`} download><Download size={14} aria-hidden="true" /> Download diagram</a>
        <a href={`/diagrams/${name}.svg`} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden="true" /> Full size</a>
      </figcaption>
    </figure>
  );
}
