"use client";

/** The "typed" confirmation tier for irreversible creation (D-052; LP-02: the stablecoin's currency code). */
import { useId, useState } from "react";
import { TX } from "./copy";

export function TypedConfirm({ code, onMatch }: { code: string; onMatch: (matched: boolean) => void }) {
  const id = useId();
  const [value, setValue] = useState("");
  const matched = value.trim() === code;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="type-caption text-ink-secondary">{TX.typedConfirm(code)}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onMatch(e.target.value.trim() === code);
        }}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        aria-invalid={value.length > 0 && !matched}
        className="h-12 rounded-md border border-hairline bg-ground px-3 text-base text-ink numbers"
      />
      {value.length > 0 && !matched ? <p className="type-caption text-warning" role="status">{TX.typedMismatch}</p> : null}
    </div>
  );
}
