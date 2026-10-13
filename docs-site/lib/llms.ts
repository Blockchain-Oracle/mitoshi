// Ported from Owarine 90a91d71:docs-site/lib/llms.ts (D-227): Copy Markdown and the text exports keep the sources.
import type { InferPageType } from 'fumadocs-core/source';
import type { source } from './source';
import { site, sourceUrl } from './site';

type GuidePage = InferPageType<typeof source>;

export async function guideMarkdown(page: GuidePage): Promise<string> {
  const body = await page.data.getText('processed');
  const sources = page.data.sources ?? [];
  const notes = sources.length
    ? `\n\n## Source notes\n\nApplication source reviewed ${site.reviewed}, revision ${site.revision}.\n\n${sources.map(path => { const url = sourceUrl(path); return url ? `- [${path}](${url})` : `- \`${path}\``; }).join('\n')}`
    : '';
  return `# ${page.data.title}\n\n${page.data.description || ''}\n\nCanonical URL: ${site.docs}${page.url}\nApplication origin: ${site.app}\nReviewed: ${site.reviewed}\n\n${body}${notes}`;
}
