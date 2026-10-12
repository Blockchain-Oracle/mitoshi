'use client';
// Ported from Owarine 90a91d71:docs-site/components/walkthrough.tsx (D-227): a captioned recording of the deployed
// product with chapters, a transcript and its provenance. A clip that hasn't been recorded and published renders
// nothing, never a stand-in.
import { useId, useRef, useState } from 'react';
import { Download, Play } from 'lucide-react';
import { walkthroughs, walkthroughTimestamp } from '@/lib/walkthroughs';
import { Brand } from './brand';

export function Walkthrough({ name }: { name: string }) {
  const movie = walkthroughs[name];
  const player = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(0);
  const descriptionId = useId();
  if (!movie) return null;

  const at = (time: number) => movie.chapters.reduce((current, chapter, index) => (chapter.time <= time ? index : current), 0);
  function jump(time: number) {
    const video = player.current;
    if (!video) return;
    // Seeking keeps the playback state: a chapter click never starts motion for someone who paused.
    video.currentTime = time;
    setActive(at(time));
  }

  return (
    <figure className="walkthrough not-prose">
      <div className="guide-top"><span><Play size={14} aria-hidden="true" />{movie.title}</span><Brand small /></div>
      <video ref={player} controls playsInline preload="metadata" poster={movie.poster}
        aria-label={movie.title} aria-describedby={descriptionId}
        onTimeUpdate={(event) => setActive(at(event.currentTarget.currentTime))}>
        {movie.sources.map((source) => <source key={source.src} src={source.src} type={source.type} />)}
        <track kind="captions" src={movie.captions} srcLang="en" label="English" default />
        Your browser cannot play this video. <a href={movie.sources[0].src}>Download it.</a>
      </video>
      <figcaption id={descriptionId}>
        <p>{movie.description}</p>
        <p>{walkthroughTimestamp(movie.duration)} · Recorded {new Date(movie.capturedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })} on the deployed testnet product · Silent, with captions.</p>
      </figcaption>
      <div className="video-chapters" role="group" aria-label={`${movie.title}: chapters`}>
        {movie.chapters.map((chapter, index) => (
          <button key={chapter.time} type="button" aria-current={active === index ? 'step' : undefined}
            onClick={() => jump(chapter.time)} aria-label={`Seek to ${walkthroughTimestamp(chapter.time)}: ${chapter.title}`}>
            <span>{walkthroughTimestamp(chapter.time)}</span>{chapter.title}
          </button>
        ))}
      </div>
      <details className="video-transcript">
        <summary>Read the transcript</summary>
        {movie.chapters.map((chapter) => <p key={chapter.time}><strong>{walkthroughTimestamp(chapter.time)} · {chapter.title}.</strong> {chapter.text}</p>)}
      </details>
      <div className="raw-capture-links">
        <a className="raw-capture-link" href={movie.sources[0].src} download><Download size={14} aria-hidden="true" /> Video</a>
        <a className="raw-capture-link" href={movie.captions} download>Captions</a>
        <a className="raw-capture-link" href={movie.metadata}>Provenance</a>
      </div>
    </figure>
  );
}
