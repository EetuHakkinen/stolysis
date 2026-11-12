import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isReordering } from "./ordering.ts";

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
