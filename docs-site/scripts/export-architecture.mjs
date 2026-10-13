#!/usr/bin/env node
// Ported from Owarine 90a91d71:docs-site/scripts/export-architecture.mjs (D-227): each graph in lib/architecture.json
// as a downloadable SVG in Mitoshi's dark brand. Run `pnpm diagrams` after changing the data.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(process.env.MITOSHI_SOURCE_DIR || resolve(root, '..'));
const graphs = JSON.parse(readFileSync(resolve(root, 'lib/architecture.json'), 'utf8'));
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const wrap = (value, max = 26) => {
  const words = value.split(' '), lines = [''];
  for (const word of words) {
    const last = lines.length - 1;
    if (lines[last] && `${lines[last]} ${word}`.length > max) lines.push(word);
    else lines[last] = `${lines[last]} ${word}`.trim();
  }
  return lines.slice(0, 3);
};
const text = (lines, x, y, className, step = 21) => lines.map((line, i) => `<text class="${className}" x="${x}" y="${y + i * step}">${escape(line)}</text>`).join('');
const dir = resolve(root, 'public/diagrams');
mkdirSync(dir, { recursive: true });
for (const [name, graph] of Object.entries(graphs)) {
  if (graph.rows.length !== 3 || graph.rows.some(row => row.nodes.length !== 4 || row.arrows.length !== 3)) throw new Error(`Invalid architecture graph: ${name}`);
  for (const path of graph.sources) if (!existsSync(resolve(source, path))) throw new Error(`Missing source ${path}`);
  const shapes = graph.rows.map((row, rowIndex) => {
    const y = 200 + rowIndex * 235;
    const nodes = row.nodes.map((node, i) => {
      const x = 32 + i * 350;
      return `<g><rect x="${x}" y="${y}" width="308" height="152" rx="15" class="node"/>` +
        `<text x="${x + 20}" y="${y + 27}" class="num">${rowIndex + 1}.${i + 1}</text>` +
        text(wrap(node.title, 23), x + 20, y + 66, 'title', 23) +
        text(wrap(node.subtitle, 33), x + 20, y + 120, 'sub', 18) + '</g>';
    }).join('');
    const arrows = row.arrows.map((label, i) => {
      const x = 342 + i * 350;
      return `<path d="M${x} ${y + 76}h31" class="arrow" marker-end="url(#tip)"/>` +
        `<text x="${x + 13}" y="${y + 179}" class="arrow-label" text-anchor="middle">${escape(label)}</text>`;
    }).join('');
    return `<text x="32" y="${y - 17}" class="row">${escape(row.label)}</text>${nodes}${arrows}`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="heading description" viewBox="0 0 1400 1010">
<title id="heading">${escape(graph.title)}</title><desc id="description">${escape(graph.subtitle)} Three rows of four connected stages. Each stage's authority boundary is in the interactive documentation.</desc>
<defs><marker id="tip" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 8 4 0 8Z" fill="#E04D26"/></marker></defs>
<style>.background{fill:#050505}.node{fill:#0A0A0A;stroke:#262626;stroke-width:2}.heading,.title{font-family:Arial,sans-serif;fill:#FFFFFF;font-weight:700}.heading{font-size:36px}.title{font-size:22px}.sub{font:16px Arial,sans-serif;fill:#A3A3A3}.num,.row{font:700 15px Arial,sans-serif;fill:#E04D26}.arrow{stroke:#E04D26;stroke-width:2.5}.arrow-label{font:12px Arial,sans-serif;fill:#A3A3A3}.footer{font:14px Arial,sans-serif;fill:#A3A3A3}</style>
<rect width="1400" height="1010" class="background"/>
<text x="32" y="66" class="heading">${escape(graph.title)}</text>
<text x="32" y="101" class="sub">${escape(graph.subtitle)}</text>
<path d="M32 123H1368" stroke="#262626" stroke-width="2"/>
${shapes}
<path d="M32 920H1368" stroke="#262626" stroke-width="2"/>
<text x="32" y="951" class="footer">Mitoshi architecture · checked 12 October 2026 · Tempo testnet (Moderato) · testnet dollars have no value</text>
<text x="32" y="979" class="footer">The docs' Availability and Evidence pages say what has run live and when.</text>
</svg>`;
  writeFileSync(resolve(dir, `${name}.svg`), svg);
  console.log(`Rendered ${name}.svg`);
}
