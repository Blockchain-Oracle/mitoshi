// Ported from Owarine 90a91d71:docs-site/app/(docs)/layout.tsx (D-227): the header slot, no tabs, the sidebar's footer
// note. The repository is private, so there is no source link in the sidebar.
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';
import { Header, EmptySlot } from '@/components/header';

function SidebarFooter() {
  return <div className="sidebar-footer"><p className="sidebar-note">Tempo testnet · Moderato (42431).<br />Testnet dollars have no value.</p></div>;
}

const grid = {
  gridTemplate: '"header header header" "sidebar toc-popover toc" "sidebar main toc" 1fr / var(--fd-sidebar-col) minmax(0, 1fr) var(--fd-toc-width)',
  '--fd-docs-row-1': '72px',
  '--fd-docs-row-2': '72px',
  '--fd-docs-row-3': 'calc(72px + var(--fd-toc-popover-height))',
} as React.CSSProperties;

export default function DocumentationLayout({ children }: { children: React.ReactNode }) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      tabs={false}
      nav={{ title: 'Mitoshi Docs' }}
      slots={{ header: Header, navTitle: EmptySlot }}
      themeSwitch={{ enabled: false }}
      searchToggle={{ enabled: false }}
      sidebar={{ collapsible: false, defaultOpenLevel: 0, footer: <SidebarFooter key="docs-footer" /> }}
      containerProps={{ style: grid }}
    >
      {children}
    </DocsLayout>
  );
}
