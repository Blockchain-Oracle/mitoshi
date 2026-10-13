// Ported from Owarine 90a91d71:docs-site/app/layout.tsx (D-227): Mitoshi's faces (Sora, Inter, JetBrains Mono) and
// its dark default; the light theme is one tap away.
import type { Metadata } from 'next';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { Inter, JetBrains_Mono, Sora } from 'next/font/google';
import { site } from '@/lib/site';
import './global.css';
const sora = Sora({ subsets: ['latin'], variable: '--font-sora', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });
export const metadata: Metadata = {
  metadataBase: new URL(site.docs),
  title: { default: 'Mitoshi Docs — prediction markets and stocks on Tempo', template: '%s · Mitoshi Docs' },
  description: 'Guides to Mitoshi on Tempo: sign up with a passkey, call a Window UP or DOWN, and see how prints, settlement, the house and the keepers fit together.',
  icons: { icon: '/icon.svg' },
};
const searchLinks: [string, string][] = [['Quickstart', '/start/quickstart'], ['Windows and lanes', '/trading/windows'], ['How it fits together', '/architecture/overview']];
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sora.variable} ${inter.variable} ${mono.variable}`}>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <RootProvider theme={{ defaultTheme: 'dark', enableSystem: false, storageKey: 'mitoshi-docs-theme' }} search={{ links: searchLinks }}>{children}</RootProvider>
      </body>
    </html>
  );
}
