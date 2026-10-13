// Ported from Owarine 90a91d71:docs-site/app/llms-full.txt/route.ts (D-227).
import { source } from '@/lib/source';
import { guideMarkdown } from '@/lib/llms';
import { site } from '@/lib/site';
export const dynamic = 'force-static';

export async function GET() {
  const pages = await Promise.all(source.getPages().map(guideMarkdown));
  const intro = `# Mitoshi Docs — full text\n\nDocumentation origin: ${site.docs}\nApplication origin: ${site.app}\nReviewed: ${site.reviewed} against app revision ${site.revision}\n\nEach guide includes its canonical URL. Resolve relative documentation links against the docs origin; AppLink components refer to the application origin. The application repository is private, so source notes name paths only.\n\n`;
  return new Response(intro + pages.join('\n\n---\n\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
