// Ported from Owarine 90a91d71:web/src/components/kit/SkyCollage.tsx (R4-13a, D-227) — UGLYCASH's sky with its cut-out
// objects, in Mitoshi's dusk: the canvas darkening to a vermilion horizon (`kit.css` `.kit-sky`), both themes. The
// objects are Microsoft's Fluent Emoji 3D renders (MIT, public/art/fluent/SOURCES.md), drawn as plain images so the
// public site carries no image runtime; they drift gently, stand still under reduced motion, and step aside under
// 640 px. A server component: no client JS.
import type { CSSProperties, ReactNode } from "react";
import { FLUENT, type FluentName } from "@/lib/art/fluent";
import { cn } from "@/lib/utils";

/** One Fluent Emoji 3D object, decorative unless given `alt`. */
export function FluentArt({ name, size = 96, className, style, eager, alt = "" }: { name: FluentName; size?: number; className?: string; style?: CSSProperties; eager?: boolean; alt?: string }) {
  const art = FLUENT[name];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 3 KB vendored webp; next/image would ship its runtime to the site group
    <img src={art.src} width={size} height={Math.round((size * art.h) / art.w)} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" draggable={false} className={cn("kit-art", className)} style={style} />
  );
}

export interface CollageObject {
  name: FluentName;
  /** The object's centre, in % of the collage box. */
  x: number;
  y: number;
  size: number;
  rotate?: number;
  /** Drift gently (off under reduced motion); the number staggers the phase. */
  float?: number;
}

export function SkyCollage({ objects = [], children, className, eager }: { objects?: readonly CollageObject[]; children?: ReactNode; className?: string; eager?: boolean }) {
  return (
    <div data-slot="sky" className={cn("kit-sky", className)}>
      {objects.map((o, i) => (
        <div
          key={`${o.name}-${i}`}
          aria-hidden
          className="kit-sky-object"
          data-float={o.float === undefined ? undefined : ""}
          style={{ left: `${o.x}%`, top: `${o.y}%`, rotate: `${o.rotate ?? 0}deg`, animationDelay: o.float === undefined ? undefined : `${-o.float * 1.3}s` }}
        >
          <FluentArt name={o.name} size={o.size} eager={eager} />
        </div>
      ))}
      <div className="kit-sky-body">{children}</div>
    </div>
  );
}
