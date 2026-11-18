"use client";

import { useMemo } from "react";
import { textDiff } from "@/lib/text-diff";

// How a text changed from `before` to `after`, word by word: added text highlighted and removed
// text struck through, in place. Shown as plain text (e.g. markdown source), keeping line breaks.
export function TextDiff({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => textDiff(before, after), [before, after]);

  return (
    <div className="whitespace-pre-wrap break-words text-sm">
      {parts.map((part, i) =>
        part.kind === "added" ? (
          <ins key={i} className="rounded-sm bg-emerald-500/15 text-emerald-700 no-underline dark:text-emerald-400">
            {part.text}
          </ins>
        ) : part.kind === "removed" ? (
          <del key={i} className="rounded-sm bg-destructive/10 text-destructive line-through">
            {part.text}
          </del>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </div>
  );
}
