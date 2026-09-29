// Ported from Masayume 68f7a09:web/src/components/shell/Footer.tsx — the docs link kept, the disclosure and the
// legal/contact links added (D-043), external links routed through `open-external` (fix 5).
import Link from "next/link";
import { FOOTER } from "@/lib/copy";
import { DOCS_URL } from "@/lib/docs-url";
import { ExternalLink } from "./ExternalLink";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <nav className="footer-links" aria-label="Footer">
          <ExternalLink href={DOCS_URL}>{FOOTER.links.docs}</ExternalLink>
          <Link href="/status">{FOOTER.links.status}</Link>
          <Link href="/privacy">{FOOTER.links.privacy}</Link>
          <Link href="/terms">{FOOTER.links.terms}</Link>
          <Link href="/contact">{FOOTER.links.contact}</Link>
        </nav>
        <p className="footer-disclosure">{FOOTER.tagline}. {FOOTER.disclosure}</p>
      </div>
    </footer>
  );
}
