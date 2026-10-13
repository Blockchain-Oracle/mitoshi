// Ported from Owarine 90a91d71:docs-site/app/raw/[[...slug]]/route.ts (D-227): each guide as Markdown.
import { source } from '@/lib/source';
import { guideMarkdown } from '@/lib/llms';
export function generateStaticParams() { return source.generateParams(); }
export async function GET(_request: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const page = source.getPage((await params).slug);
  if (!page) return new Response('Page not found', { status: 404 });
  return new Response(await guideMarkdown(page), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
