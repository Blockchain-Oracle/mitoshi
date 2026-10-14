// The recorded product walkthrough plays here until an official YouTube product demo is published.
// Keep the source switch in copy.ts so the page can put that YouTube player first when it exists.
import { DEMO } from "./copy";

export function DemoVideo() {
  const video = DEMO.video;
  if (video.kind === "local") {
    return (
      <figure className="demo-film demo-film--portrait">
        <video className="demo-film-frame" controls playsInline preload="metadata" poster={video.poster} aria-label={video.title}>
          <source src={video.src} type="video/mp4" />
          <track kind="captions" src={video.captions} srcLang="en" label="English" default />
          Your browser cannot play this video. <a href={video.src}>Download the recording</a>.
        </video>
        <figcaption className="demo-film-caption"><strong>{video.title}</strong><span>{video.description}</span></figcaption>
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
