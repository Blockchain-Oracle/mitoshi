// Ported from Owarine 90a91d71:docs-site/lib/source.ts (D-227): each page may list the app files it was checked against.
import { loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { defineDocs } from 'fumadocs-mdx/macro';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { z } from 'zod';

const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema.extend({ sources: z.array(z.string()).optional() }),
    postprocess: { includeProcessedMarkdown: true },
  },
  meta: { schema: metaSchema },
});
export const source = loader({ baseUrl: '/', source: docs.toFumadocsSource(), plugins: [lucideIconsPlugin()] });
