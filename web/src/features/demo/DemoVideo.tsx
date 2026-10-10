// Ported from Masayume 68f7a09:web/src/features/demo/DemoVideo.tsx — the official demo embedded once it is published
// (`DEMO.video`); until then the frame says it is being recorded and points at the walkthrough (L-13: an honest state,
// never a dead embed).
import { DEMO } from "./copy";

export function DemoVideo() {
  const video = DEMO.video;
  if (!video) {
    return (
      <figure className="demo-video-figure">
        <div className="demo-video demo-video-pending" role="note">
          <strong>{DEMO.videoPending.title}</strong>
          <span>{DEMO.videoPending.body}</span>
        </div>
      </figure>
    );
  }
  return (
    <figure className="demo-video-figure">
      <iframe
        className="demo-video"
        width={1280}
        height={720}
        src={video.embedUrl}
        title={video.title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        aria-describedby="demo-video-caption"
      />
      <figcaption id="demo-video-caption" className="demo-video-caption">
        <span>{video.title}</span>
        <a href={video.watchUrl} target="_blank" rel="noopener noreferrer">Watch on YouTube ↗</a>
      </figcaption>
    </figure>
  );
}
