import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkFormula, formatFormula, formulaSchema, hasCycle, referencedFieldIds, type Formula } from "./formulas.ts";

const field = (id: number, period: "current" | "previous" = "current") => ({ field: id, period });
const op = (operator: "+" | "-" | "*" | "/") => ({ operator });
const open = { parenthesis: "(" as const };
const close = { parenthesis: ")" as const };
const num = (value: number) => ({ number: value });

describe("formulaSchema", () => {
  it("accepts every token type", () => {
    const formula = [open, field(1), op("/"), field(2, "previous"), close, op("*"), num(1.5)];
    assert.deepEqual(formulaSchema.parse(formula), formula);
  });

  it("rejects unknown tokens and extra keys", () => {
    assert.equal(formulaSchema.safeParse([{ operator: "^" }]).success, false);
    assert.equal(formulaSchema.safeParse([{ field: 1, period: "next" }]).success, false);
    assert.equal(formulaSchema.safeParse([{ number: 1, field: 2 }]).success, false);
    assert.equal(formulaSchema.safeParse(["+"]).success, false);
  });
});

describe("checkFormula", () => {
  it("accepts valid formulas", () => {
    assert.equal(checkFormula([field(1)]), undefined);
    assert.equal(checkFormula([field(1), op("-"), field(2), op("-"), field(3)]), undefined);
    assert.equal(checkFormula([open, field(1), op("/"), field(2), close, op("*"), num(100)]), undefined);
    assert.equal(checkFormula([field(1), op("-"), field(1, "previous")]), undefined);
    assert.equal(checkFormula([open, open, num(1), close, close]), undefined);
  });

  it("accepts a minus that negates", () => {
    assert.equal(checkFormula([op("-"), field(1)]), undefined);
    assert.equal(checkFormula([field(1), op("*"), op("-"), num(2)]), undefined);
    assert.equal(checkFormula([op("-"), open, field(1), op("+"), field(2), close]), undefined);
  });

  it("rejects an empty formula", () => {
    assert.deepEqual(checkFormula([]), { error: "empty", index: 0 });
  });

  it("rejects missing operands", () => {
    assert.deepEqual(checkFormula([field(1), op("+")]), { error: "missingOperand", index: 2 });
    assert.deepEqual(checkFormula([op("*"), field(1)]), { error: "missingOperand", index: 0 });
    assert.deepEqual(checkFormula([field(1), op("+"), op("*"), field(2)]), { error: "missingOperand", index: 2 });
    assert.deepEqual(checkFormula([open, close]), { error: "missingOperand", index: 1 });
  });

  it("rejects missing operators", () => {
    assert.deepEqual(checkFormula([field(1), field(2)]), { error: "missingOperator", index: 1 });
    assert.deepEqual(checkFormula([num(2), open, field(1), close]), { error: "missingOperator", index: 1 });
  });

  it("rejects unbalanced parentheses", () => {
    assert.deepEqual(checkFormula([open, field(1)]), { error: "unbalancedParentheses", index: 2 });
    assert.deepEqual(checkFormula([field(1), close]), { error: "unbalancedParentheses", index: 1 });
  });
});

describe("referencedFieldIds", () => {
  it("lists each field once", () => {
    assert.deepEqual(referencedFieldIds([field(1), op("-"), field(1, "previous"), op("+"), field(2)]), [1, 2]);
    assert.deepEqual(referencedFieldIds([num(1)]), []);
  });
});

describe("hasCycle", () => {
  it("finds direct and indirect loops through current values", () => {
    assert.equal(hasCycle(new Map([[1, [field(1)]]])), true);
    assert.equal(
      hasCycle(
        new Map<number, Formula>([
          [1, [field(2), op("+"), num(1)]],
          [2, [field(3)]],
          [3, [field(1), op("*"), num(2)]],
        ]),
      ),
      true,
    );
  });

  it("allows previous values and shared dependencies", () => {
    assert.equal(hasCycle(new Map([[1, [field(1, "previous"), op("+"), field(2)]]])), false);
    assert.equal(
      hasCycle(
        new Map<number, Formula>([
          [1, [field(2), op("+"), field(3)]],
          [2, [field(3)]],
        ]),
      ),
      false,
    );
  });
});

describe("formatFormula", () => {
  const names: Record<number, string> = { 1: "Liikevaihto", 2: "Liikevoitto" };
  const format = {
    field: (id: number, period: string) => (period === "previous" ? `${names[id]} (prev)` : names[id]),
    number: String,
  };

  it("writes operators with spaces and negation without", () => {
    assert.equal(
      formatFormula([open, field(2), op("/"), field(1), close, op("*"), num(100)], format),
      "(Liikevoitto ÷ Liikevaihto) × 100",
    );
    assert.equal(formatFormula([op("-"), field(1), op("-"), field(1, "previous")], format), "−Liikevaihto − Liikevaihto (prev)");
  });
});
