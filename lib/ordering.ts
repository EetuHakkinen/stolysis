// Whether ids lists every one of the existing ids exactly once, in any order.
export function isReordering(ids: number[], existing: number[]): boolean {
  const set = new Set(existing);
  return ids.length === set.size && new Set(ids).size === set.size && ids.every((id) => set.has(id));
}
