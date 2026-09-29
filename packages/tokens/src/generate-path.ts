import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Where the generated web stylesheet lives. */
export const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../web/src/styles/tokens.generated.css");
