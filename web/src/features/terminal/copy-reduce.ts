// Reduce, redone (round 7): pick a part, see what it pays, hold to cash out (ui/ReducePanel.tsx). Its own file so the
// terminal's copy stays under the length rule.
export const REDUCE = {
    all: "All",
    unknown: "Reading what it pays…",
    closes: (gets: string) => `You get ≈ ${gets} · the position closes`,
    splits: (gets: string, keeps: string) => `You get ≈ ${gets} · ${keeps} keeps riding`,
    cashOut: "Cash out",
    cashOutFor: (gets: string) => `Hold to cash out ≈ ${gets}`,
    holdPart: "Cashing out",
    holdAll: "Closing",
} as const;
