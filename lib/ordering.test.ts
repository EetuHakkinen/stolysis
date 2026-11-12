import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isReordering, mergeDefaults } from "./ordering.ts";

describe("isReordering", () => {
  it("accepts the same ids in any order", () => {
    assert.equal(isReordering([3, 1, 2], [1, 2, 3]), true);
    assert.equal(isReordering([], []), true);
  });

  it("rejects missing, extra, duplicate and unknown ids", () => {
    assert.equal(isReordering([1, 2], [1, 2, 3]), false);
    assert.equal(isReordering([1, 2, 3, 4], [1, 2, 3]), false);
    assert.equal(isReordering([1, 1, 2], [1, 2, 3]), false);
    assert.equal(isReordering([1, 2, 4], [1, 2, 3]), false);
  });
});

describe("mergeDefaults", () => {
  const merge = (existing: string[], defaults: string[]) =>
    mergeDefaults(existing, defaults, (item) => existing.find((name) => name === item)).map((entry) =>
      "existing" in entry ? entry.existing : `+${entry.added}`,
    );

  it("places added defaults after the closest preceding default the list has", () => {
    assert.deepEqual(merge(["A", "C", "X"], ["A", "B", "C", "D"]), ["A", "+B", "C", "+D", "X"]);
  });

  it("places defaults before the first matched one first", () => {
    assert.deepEqual(merge(["X", "C"], ["A", "B", "C"]), ["+A", "+B", "X", "C"]);
  });

  it("keeps the existing order when it differs from the defaults", () => {
    assert.deepEqual(merge(["C", "A"], ["A", "B", "C"]), ["C", "A", "+B"]);
  });

  it("adds all defaults to an empty list in their order", () => {
    assert.deepEqual(merge([], ["A", "B"]), ["+A", "+B"]);
  });
});
