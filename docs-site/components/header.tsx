'use client';
// Ported from Owarine 90a91d71:docs-site/components/header.tsx (D-227): search, the theme, "Open app", the phone menu.
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useSearchContext } from 'fumadocs-ui/contexts/search';
import { useDocsLayout } from 'fumadocs-ui/layouts/docs';
import { ArrowUpRight, Menu, Search, Sun, Moon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Brand } from './brand';
import { appUrl } from '@/lib/site';

export function Header() {
  const { setOpenSearch } = useSearchContext();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { slots } = useDocsLayout();
  useEffect(() => setMounted(true), []);
  const dark = !mounted || resolvedTheme === 'dark';
  return (
    <header className="docs-header">
      <Link href="/" aria-label="Mitoshi documentation home"><Brand docs /></Link>
      <div className="header-actions">
        <button className="docs-search" onClick={() => setOpenSearch(true)} aria-label="Search the docs"><Search size={18} /><span>Search the docs…</span><kbd>⌘ K</kbd></button>
        <button className="theme-button" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}>{dark ? <Sun size={20} /> : <Moon size={20} />}</button>
        <a className="open-app" href={appUrl()} target="_blank" rel="noreferrer">Open app <ArrowUpRight size={17} /></a>
        {slots.sidebar && <slots.sidebar.trigger className="mobile-menu" aria-label="Open documentation navigation"><Menu size={22} /></slots.sidebar.trigger>}
      </div>
    </header>
  );
}
export function EmptySlot() { return null; }
