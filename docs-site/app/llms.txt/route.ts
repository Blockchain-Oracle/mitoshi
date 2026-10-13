// Ported from Owarine 90a91d71:docs-site/app/llms.txt/route.ts (D-227).
import { source } from '@/lib/source';
import { site } from '@/lib/site';
export const dynamic = 'force-static';

export function GET() {
  const start = ['/start/quickstart', '/trading/windows', '/trading/settlement', '/architecture/overview', '/help/availability'];
  const pages = source.getPages();
  const priority = start.flatMap(url => pages.filter(page => page.url === url));
  const entry = (page: (typeof pages)[number]) => `- [${page.data.title}](${site.docs}${page.url}): ${page.data.description || ''} [Markdown](${site.docs}/raw/${page.slugs.join('/')})`;
  const text = `# Mitoshi Docs

> Guides to Mitoshi 見通し, prediction markets and stocks on Tempo. It runs on Tempo testnet (Moderato, chain 42431) with testnet pathUSD that has no value. Reviewed ${site.reviewed} against app revision ${site.revision}.

Each Window is one asset over a fixed stretch of time with its own on-chain order book in Mitoshi's EventsEngine. UP wins if the closing print is at or above the opening print, DOWN if below; a winning contract pays $1. Prints are RedStone signed packages that the engine's verifier checks on chain; the live chart line never settles anything. Sign-up is a passkey; one-tap trading uses a Tempo access key or a Trading Balance (EventVaultV2) grant, and Mitoshi's relay pays the network fee for calls inside its policy. Ops keepers roll Windows, post prints, settle, quote the house's books and sell exits with the app closed.

## Start here

${priority.map(entry).join('\n')}

## All guides

${pages.filter(page => !start.includes(page.url)).map(entry).join('\n')}

## Complete export

- [Full documentation text](${site.docs}/llms-full.txt): All guides with canonical URLs.
`;
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
