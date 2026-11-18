import { diffWords } from "diff";

// Word-level differences between two texts, for showing how a text changed. Pure, so it runs in
// tests and in the browser.

export type DiffPart = { kind: "same" | "added" | "removed"; text: string };

// The parts of `after` with the text removed from `before` in between, in order.
export function textDiff(before: string, after: string): DiffPart[] {
  return diffWords(before, after).map((change) => ({
    kind: change.added ? "added" : change.removed ? "removed" : "same",
    text: change.value,
  }));
}
