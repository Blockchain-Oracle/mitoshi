// Ported from Masayume 68f7a09:web/src/features/install/DownloadPage.tsx
import MitoshiMark from "@/components/shell/MitoshiMark";
import "@/styles/download.css";
import { INSTALL } from "./copy";
import { InstallCta } from "./InstallCta";
import { PhoneShot } from "./PhoneShot";

/**
 * `/download` — the page the app strip lands on, ported from the reference's
 * `app/download/page.tsx` element for element (`.dl-*` in part-18.css). The words are
 * Mitoshi's: an installable web app on Tempo testnet, and no native build claimed.
 */
export function DownloadPage() {
  return (
    <div className="dl">
      <section className="dl-hero">
        <div className="dl-copy">
          <div className="section-eyebrow dl-eyebrow">{INSTALL.eyebrow}</div>
          <h1 className="dl-title">
            {INSTALL.titleLead}
            <em>{INSTALL.titleEm}</em>
          </h1>
          <p className="dl-line">{INSTALL.line}</p>

          <InstallCta />

          <ul className="dl-meta">
            {INSTALL.meta.map((item) => (
              <li key={item.label}>
                <b>{item.label}</b>
                <span>{item.note}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="dl-stage" aria-hidden="false">
          <PhoneShot />
        </div>
      </section>

      <section className="dl-points">
        {INSTALL.points.map((point) => (
          <article key={point.title}>
            <span className="dl-pt-mark">
              <MitoshiMark />
            </span>
            <h3>{point.title}</h3>
            <p>{point.body}</p>
          </article>
        ))}
      </section>

      <p className="dl-foot">{INSTALL.foot}</p>
    </div>
  );
}
