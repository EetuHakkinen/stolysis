import { diffArrays, diffWords } from "diff";

// Differences between two texts, for showing how a text changed. Pure, so it runs in tests and in
// the browser.

export type DiffPart = { kind: "same" | "added" | "removed"; text: string };

// The parts of `after` with the text removed from `before` in between, word by word, in order.
export function textDiff(before: string, after: string): DiffPart[] {
  return diffWords(before, after).map((change) => ({
    kind: change.added ? "added" : change.removed ? "removed" : "same",
    text: change.value,
  }));
}

// Only the changed paragraphs, each run of consecutive changed paragraphs diffed word by word, in
// order. A paragraph is a non-blank line, so in markdown a list item is a paragraph of its own.
export function changedParagraphs(before: string, after: string): DiffPart[][] {
  const hunks: DiffPart[][] = [];
  let removed: string[] = [];
  let added: string[] = [];
  const flush = () => {
    if (removed.length > 0 || added.length > 0) hunks.push(textDiff(removed.join("\n"), added.join("\n")));
    removed = [];
    added = [];
  };
  for (const change of diffArrays(paragraphs(before), paragraphs(after))) {
    if (change.removed) removed.push(...change.value);
    else if (change.added) added.push(...change.value);
    else flush();
  }
  flush();
  return hunks;
}

function paragraphs(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
