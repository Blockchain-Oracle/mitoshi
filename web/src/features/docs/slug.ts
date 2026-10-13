/** The anchor a docs heading's text makes: the server sets it on string H2s (Prose), the contents rail reads it. */
export const headingSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
