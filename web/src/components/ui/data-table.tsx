"use client";
// From 21st.dev 31861 wensity/data-table — revamped per D-044 into the /surface table (S10e). Kept: the primitives
// (`Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`), the density scale, the sortable header — a real
// <button> in the <th> with `aria-sort` and the morphing chevron indicator — the animated sort (rows glide to their new
// place on a shared layout group), the expand trigger cell with `aria-expanded`, and the expandable detail row that
// grows on a grid-rows transition and is `inert` while closed. Changed: framer-motion → `m.*` under LazyMotion; Tabler
// icons → lucide; shadcn/`--primitive-*` literals → Masayume tokens (`border-hairline`, `text-ink*`, `bg-surface-*`);
// 44 px hit areas on the sort and expand controls; the search, filter, selection and pagination of the composed
// `DataTable` dropped (the surface lists a handful of live Windows — the host sorts and expands).
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { AnimatePresence, LayoutGroup, m, useReducedMotion } from "motion/react";
import * as React from "react";
import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc" | null;
export type TableDensity = "compact" | "comfortable";

const EASE_MORPH = [0.32, 0.72, 0, 1] as const;
const SORT_S = 0.36;
const DENSITY: Record<TableDensity, { head: string; cell: string }> = {
  compact: { head: "h-10 px-3 type-label-micro", cell: "h-12 px-3 type-caption" },
  comfortable: { head: "h-11 px-4 type-label-micro", cell: "h-14 px-4 type-body" },
};

const Ctx = React.createContext<{ density: TableDensity; animatedSort: boolean; layoutId: string }>({ density: "comfortable", animatedSort: false, layoutId: "dt" });

function SortIndicator({ direction }: { direction: SortDirection }) {
  const reduce = useReducedMotion();
  const Icon = direction === "asc" ? ChevronUp : direction === "desc" ? ChevronDown : ChevronsUpDown;
  return (
    <span className="relative inline-flex size-3.5 shrink-0 items-center justify-center overflow-hidden" aria-hidden>
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={direction ?? "idle"}
          initial={reduce ? false : { opacity: 0, scale: 0.92, y: direction === "desc" ? -3 : 3 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, scale: 0.92 }}
          transition={{ duration: SORT_S, ease: EASE_MORPH }}
          className={cn("absolute inset-0 inline-flex items-center justify-center", direction ? "text-ink" : "text-ink-secondary")}
        >
          <Icon className="size-3.5" />
        </m.span>
      </AnimatePresence>
    </span>
  );
}

export function Table({ density = "comfortable", className, children, label, ...props }: React.HTMLAttributes<HTMLDivElement> & { density?: TableDensity; label: string }) {
  const layoutId = React.useId();
  return (
    <Ctx.Provider value={{ density, animatedSort: false, layoutId }}>
      <div data-slot="table" className={cn("relative w-full overflow-x-auto rounded-lg border border-hairline bg-surface-1", className)} {...props}>
        <table className="w-full caption-bottom border-collapse text-left" aria-label={label}>
          {children}
        </table>
      </div>
    </Ctx.Provider>
  );
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("border-b border-hairline text-ink-secondary", className)} {...props} />;
}

export function TableBody({ animatedSort = false, className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement> & { animatedSort?: boolean }) {
  const parent = React.useContext(Ctx);
  return (
    <Ctx.Provider value={{ ...parent, animatedSort }}>
      <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props}>
        {animatedSort ? <LayoutGroup id={parent.layoutId}>{children}</LayoutGroup> : children}
      </tbody>
    </Ctx.Provider>
  );
}

export function TableRow({ className, expanded = false, children, ...props }: React.HTMLAttributes<HTMLTableRowElement> & { expanded?: boolean }) {
  const { animatedSort } = React.useContext(Ctx);
  const reduce = useReducedMotion();
  const cls = cn("border-b border-hairline transition-colors duration-200 hover:bg-surface-2 motion-reduce:transition-none", expanded && "bg-surface-2", className);
  if (animatedSort && !reduce) {
    return (
      <m.tr layout="position" transition={{ layout: { duration: SORT_S, ease: EASE_MORPH } }} data-expanded={expanded || undefined} className={cls} {...(props as React.ComponentPropsWithoutRef<typeof m.tr>)}>
        {children}
      </m.tr>
    );
  }
  return (
    <tr data-expanded={expanded || undefined} className={cls} {...props}>
      {children}
    </tr>
  );
}

export function TableHead({ className, sortDirection = null, onSort, align = "start", children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { sortDirection?: SortDirection; onSort?: () => void; align?: "start" | "end" }) {
  const { density } = React.useContext(Ctx);
  const sortable = onSort !== undefined;
  const aria = sortDirection === "asc" ? "ascending" : sortDirection === "desc" ? "descending" : sortable ? "none" : undefined;
  return (
    <th scope="col" aria-sort={aria} className={cn("relative whitespace-nowrap font-medium", DENSITY[density].head, align === "end" && "text-right", sortDirection && "text-ink", className)} {...props}>
      {sortable ? (
        <button type="button" onClick={onSort} className={cn("inline-flex min-h-touch items-center gap-1.5 rounded-sm hover:text-ink focus-visible:outline-2 focus-visible:outline-accent", align === "end" && "flex-row-reverse")}>
          <span className="truncate">{children}</span>
          <SortIndicator direction={sortDirection} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function TableCell({ className, align = "start", ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: "start" | "end" }) {
  const { density } = React.useContext(Ctx);
  return <td className={cn("align-middle text-ink", DENSITY[density].cell, align === "end" && "numbers text-right", className)} {...props} />;
}

export function TableExpandTriggerCell({ expanded, onToggle, label, className }: { expanded: boolean; onToggle: () => void; label: string; className?: string }) {
  return (
    <td className={cn("w-12 px-1 text-center", className)}>
      <button type="button" aria-expanded={expanded} aria-label={label} onClick={onToggle} className="inline-flex size-touch items-center justify-center rounded-md text-ink-secondary hover:bg-surface-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
        <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-300 motion-reduce:transition-none", expanded && "rotate-180")} />
      </button>
    </td>
  );
}

export function TableExpandableContent({ open, colSpan, children, className }: { open: boolean; colSpan: number; children: React.ReactNode; className?: string }) {
  return (
    <tr aria-hidden={!open} className={cn(open && "border-b border-hairline", className)}>
      <td colSpan={colSpan} className="p-0">
        <div className={cn("grid transition-[grid-template-rows,opacity] duration-300 motion-reduce:transition-none", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")} inert={open ? undefined : true}>
          <div className="overflow-hidden">{open ? <div className="px-4 py-3">{children}</div> : null}</div>
        </div>
      </td>
    </tr>
  );
}
