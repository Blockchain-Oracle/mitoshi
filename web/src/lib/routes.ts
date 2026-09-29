// Ported from Masayume 68f7a09:web/src/lib/routes.ts
export const MARKETS_PATH = "/markets";

/** `?note=` carries a one-line explanation across a redirect (routing law: nothing 404s, moved routes say so). */
export const NOTE_PARAM = "note";

export const NOTE_KIND = { moved: "moved" } as const;

export type NoteKind = (typeof NOTE_KIND)[keyof typeof NOTE_KIND];

/** A redirect target that carries `?note=moved` (ux-audit fix 14), keeping any query the target already has. */
export function withNote(path: string, kind: NoteKind = NOTE_KIND.moved): string {
  return `${path}${path.includes("?") ? "&" : "?"}${NOTE_PARAM}=${kind}`;
}
