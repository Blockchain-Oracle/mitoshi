// Ported from Owarine 90a91d71:docs-site/app/(docs)/[[...slug]]/page.tsx (D-227).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocsBody, DocsDescription, DocsPage, MarkdownCopyButton } from 'fumadocs-ui/layouts/docs/page';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { source } from '@/lib/source';
import { site } from '@/lib/site';
import { getMDXComponents } from '@/components/mdx';

type Props = { params: Promise<{ slug?: string[] }> };
export default async function Page({ params }: Props) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  const home = !slug?.length;
  const MDX = page.data.body;
  return (
    <DocsPage toc={page.data.toc} breadcrumb={{ enabled: !home }} footer={{ enabled: !home }} className={home ? 'welcome-page' : ''}>
      <div id="main-content" tabIndex={-1}>
        <h1 className="page-title">{page.data.title}</h1>
        <DocsDescription className="page-description">{page.data.description}</DocsDescription>
        {!home && <div className="page-tools"><span>Checked {site.reviewed} · app {site.revision}</span><MarkdownCopyButton markdownUrl={`/raw/${page.slugs.join('/')}`} /></div>}
        <DocsBody><MDX components={getMDXComponents({ a: createRelativeLink(source, page) })} /></DocsBody>
      </div>
    </DocsPage>
  );
}
export function generateStaticParams() { return source.generateParams(); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = source.getPage((await params).slug);
  if (!page) notFound();
  const shareImage = { url: '/opengraph-image', width: 1200, height: 630, type: 'image/png', alt: 'Mitoshi Docs — prediction markets and stocks on Tempo' };
  return {
    title: page.data.title,
    description: page.data.description,
    alternates: { canonical: page.url },
    openGraph: { title: page.data.title, description: page.data.description, type: 'article', images: [shareImage] },
    twitter: { card: 'summary_large_image', title: page.data.title, description: page.data.description, images: [shareImage] },
  };
}
