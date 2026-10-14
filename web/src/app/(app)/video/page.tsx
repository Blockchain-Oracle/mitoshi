import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import "@/components/kit/kit.css";
import "@/styles/demo.css";

export const metadata: Metadata = {
  title: "The Close · Mitoshi film",
  description: "A 30-second introduction to Mitoshi and its price Windows on Tempo testnet.",
};

export default function VideoPage() {
  return (
    <div className="demo">
      <section className="demo-top" aria-labelledby="film-title">
        <div className="demo-head">
          <div className="demo-head-copy">
            <h1 id="film-title" className="demo-h1">The Close</h1>
            <p className="demo-lede">A 30-second introduction to calling where a price closes on Tempo testnet.</p>
          </div>
          <Link href="/demo" className="kit-pill kit-pill--accent kit-pill--md">
            Watch the product demo <ArrowRight aria-hidden />
          </Link>
        </div>
        <figure className="demo-film">
          <video className="demo-film-frame" controls playsInline preload="metadata" poster="/video/poster.jpg" aria-label="The Close, a Mitoshi introduction">
            <source src="/video/the-close.mp4" type="video/mp4" />
            <track kind="captions" src="/video/the-close.vtt" srcLang="en" label="English" default />
            Your browser cannot play this video. <a href="/video/the-close.mp4">Download the film</a>.
          </video>
          <figcaption className="demo-film-caption">
            <strong>Motion graphic · 30 seconds</strong>
            <span>The film introduces the product idea. For an actual recorded app interaction and transaction evidence, open the product demo.</span>
          </figcaption>
        </figure>
      </section>
    </div>
  );
}
