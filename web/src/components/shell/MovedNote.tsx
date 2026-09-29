"use client";

/** The line a `?note=moved` redirect carries (routing law: a moved route says so, once, then the URL is cleaned). */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { NOTES } from "@/lib/copy";
import { NOTE_KIND, NOTE_PARAM } from "@/lib/routes";

export function MovedNote() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [shown, setShown] = useState(false);
  const moved = params.get(NOTE_PARAM) === NOTE_KIND.moved;
  useEffect(() => {
    if (!moved) return;
    setShown(true);
    const next = new URLSearchParams(params);
    next.delete(NOTE_PARAM);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }, [moved, params, pathname, router]);
  if (!shown) return null;
  return (
    <div className="shell-banner" role="status">
      <span>{NOTES.moved}</span>
    </div>
  );
}
