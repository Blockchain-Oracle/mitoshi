// Ported from Masayume 68f7a09:web/src/features/demo/DemoVideo.tsx — the official demo embedded once it is published
// (`DEMO.video`). R4-13a (D-227): until then, Owarine 90a91d71's DemoFilm pending state in one line, over a dated capture
// of the live terminal (`public/demo/terminal.png`) — on tokens, so it reads in both themes (it was dark text on a black
// card in light mode).
import { DEMO } from "./copy";

export function DemoVideo() {
  const video = DEMO.video;
  if (!video) {
    return (
      <figure className="demo-film">
        {/* eslint-disable-next-line @next/next/no-img-element -- a dated capture shown as the film's poster */}
        <img src="/demo/terminal.png" alt={DEMO.poster} width={1440} height={900} className="demo-film-poster" loading="lazy" decoding="async" />
        <figcaption className="demo-film-pending" role="note">{DEMO.videoPending}</figcaption>
      </figure>
    );
  }
  return (
    <figure className="demo-film">
      <iframe
        className="demo-film-frame"
        width={1280}
        height={720}
        src={video.embedUrl}
        title={video.title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <figcaption className="demo-film-caption">
        <span>{video.title}</span>
        <a href={video.watchUrl} target="_blank" rel="noopener noreferrer">{DEMO.watchOn}</a>
      </figcaption>
    </figure>
  );
}
