"use client";

import { useMemo } from "react";
import { changedParagraphs } from "@/lib/text-diff";

// How a text changed from `before` to `after`: only the changed paragraphs, word by word, with added
// text highlighted and removed text struck through, in place. Shown as plain text (e.g. markdown
// source), keeping line breaks.
export function TextDiff({ before, after }: { before: string; after: string }) {
  const hunks = useMemo(() => changedParagraphs(before, after), [before, after]);

  return (
    <div className="flex flex-col gap-2 text-sm">
      {hunks.map((parts, i) => (
        <p key={i} className="whitespace-pre-wrap break-words">
          {parts.map((part, j) =>
            part.kind === "added" ? (
              <ins key={j} className="rounded-sm bg-emerald-500/15 text-emerald-700 no-underline dark:text-emerald-400">
                {part.text}
              </ins>
            ) : part.kind === "removed" ? (
              <del key={j} className="rounded-sm bg-destructive/10 text-destructive line-through">
                {part.text}
              </del>
            ) : (
              <span key={j}>{part.text}</span>
            ),
          )}
        </p>
      ))}
    </div>
  );
}
