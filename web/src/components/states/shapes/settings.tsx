// /settings/*'s outline (R6 money, S21; D-230): under the shell's own title and tabs (server-drawn, so they never wait),
// two grouped lists — each a micro header and a card of 48 px rows (an icon, a label, a detail) — the page's own boxes.
import { Skeleton } from "./bones";

function Group({ rows }: { rows: number }) {
  return (
    <div className="kit-group" data-bone="group">
      <Skeleton className="h-3 w-20 rounded-md" />
      <div className="kit-group-body">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="kit-item">
            <Skeleton className="size-5 rounded-md" />
            <Skeleton className="h-3.5 w-32 rounded-md" />
            <Skeleton className="ml-auto h-3 w-10 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

export const settings = () => (
  <div className="acct-page">
    <Group rows={4} />
    <Group rows={3} />
  </div>
);
