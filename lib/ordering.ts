// Whether ids lists every one of the existing ids exactly once, in any order.
export function isReordering(ids: number[], existing: number[]): boolean {
  const set = new Set(existing);
  return ids.length === set.size && new Set(ids).size === set.size && ids.every((id) => set.has(id));
}

// The existing items with the defaults that have no match among them, each placed right after the
// closest preceding default that has a match (or was added), or first when none has. The existing
// items keep their order.
export function mergeDefaults<T, D>(
  existing: T[],
  defaults: D[],
  match: (item: D) => T | undefined,
): ({ existing: T } | { added: D })[] {
  const merged: ({ existing: T } | { added: D })[] = existing.map((item) => ({ existing: item }));
  let previous = -1;
  for (const item of defaults) {
    const matched = match(item);
    const index = matched === undefined ? -1 : merged.findIndex((entry) => "existing" in entry && entry.existing === matched);
    if (index >= 0) {
      previous = index;
    } else {
      merged.splice(previous + 1, 0, { added: item });
      previous++;
    }
  }
  return merged;
}
