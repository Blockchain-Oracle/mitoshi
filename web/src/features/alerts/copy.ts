export const ALERTS = {
  title: "Price alerts",
  // R4-3 (D-227): Owarine's alerts foot wording.
  lead: (_symbol: string) => "Fires while Mitoshi is open in a tab.",
  above: "Above",
  below: "Below",
  target: "Price",
  basis: { regular: "In NYSE hours", allDay: "Any hour" },
  basisHint: "NYSE hours: session price. Any hour: plus 24/7.",
  add: "Add alert",
  bad: "Enter a price above $0.",
  none: "No alerts on this market yet.",
  remove: (line: string) => `Remove the alert ${line}`,
  fired: {
    title: (asset: string, direction: "above" | "below", target: string) => `${asset} ${direction === "above" ? "rose to" : "fell to"} ${target}`,
    body: (now: string) => `Now ${now}.`,
  },
  line: (direction: "above" | "below", target: string) => `${direction === "above" ? "above" : "below"} ${target}`,
  done: "Fired",
  allow: "Allow browser notifications",
  allowed: "Browser notifications are on.",
  blocked: "Browser notifications are blocked in this browser's settings; alerts still show here.",
} as const;
