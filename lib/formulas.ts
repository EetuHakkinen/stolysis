// Formulas of calculated result fields. A formula is a list of tokens in the order they are written,
// e.g. ( [Liikevoitto] / [Liikevaihto] ) * 100, and is saved as such in field_definition. Pure, so it
// runs on the client as well as on the server.

import { z } from "zod";

export const FORMULA_OPERATORS = ["+", "-", "*", "/"] as const;
export type FormulaOperator = (typeof FORMULA_OPERATORS)[number];

export const FORMULA_PARENTHESES = ["(", ")"] as const;
export type FormulaParenthesis = (typeof FORMULA_PARENTHESES)[number];

// current: the field's value in the same period. previous: its value in the same period a year
// earlier, i.e. the same quarter or the previous financial year.
export const FORMULA_PERIODS = ["current", "previous"] as const;
export type FormulaPeriod = (typeof FORMULA_PERIODS)[number];

export type FormulaToken =
  | { operator: FormulaOperator }
  | { parenthesis: FormulaParenthesis }
  | { number: number }
  | { field: number; period: FormulaPeriod };

export type Formula = FormulaToken[];

export const formulaSchema = z
  .array(
    z.union([
      z.strictObject({ operator: z.enum(FORMULA_OPERATORS) }),
      z.strictObject({ parenthesis: z.enum(FORMULA_PARENTHESES) }),
      z.strictObject({ number: z.number().finite() }),
      z.strictObject({ field: z.number().int().positive(), period: z.enum(FORMULA_PERIODS) }),
    ]),
  )
  .max(200);

// Error values are translation keys under ResultFields.errors.
export type FormulaError = "empty" | "missingOperand" | "missingOperator" | "unbalancedParentheses";

const isOperand = (token: FormulaToken) => "number" in token || "field" in token;

// Checks that the tokens form a valid expression: operators between operands, balanced and
// non-empty parentheses. A minus where an operand is expected negates it. On error, index is the
// token where the formula goes wrong, or the token count if it ends too early.
export function checkFormula(formula: Formula): { error: FormulaError; index: number } | undefined {
  if (formula.length === 0) return { error: "empty", index: 0 };

  let expectOperand = true;
  let depth = 0;
  for (const [index, token] of formula.entries()) {
    if (expectOperand) {
      if (isOperand(token)) expectOperand = false;
      else if ("parenthesis" in token && token.parenthesis === "(") depth++;
      else if (!("operator" in token && token.operator === "-")) return { error: "missingOperand", index };
    } else if ("operator" in token) {
      expectOperand = true;
    } else if ("parenthesis" in token && token.parenthesis === ")") {
      if (--depth < 0) return { error: "unbalancedParentheses", index };
    } else {
      return { error: "missingOperator", index };
    }
  }
  if (expectOperand) return { error: "missingOperand", index: formula.length };
  if (depth > 0) return { error: "unbalancedParentheses", index: formula.length };
  return undefined;
}

export function referencedFieldIds(formula: Formula): number[] {
  const ids = formula.flatMap((token) => ("field" in token ? [token.field] : []));
  return [...new Set(ids)];
}

// Whether the formulas (by field id) depend on each other in a loop through current period values,
// e.g. A = B + 1 and B = A * 2. A previous period value doesn't depend on the current period, so a
// field may use its own previous value.
export function hasCycle(formulas: Map<number, Formula>): boolean {
  const done = new Set<number>();
  const visiting = new Set<number>();

  function visit(fieldId: number): boolean {
    if (done.has(fieldId)) return false;
    if (visiting.has(fieldId)) return true;
    visiting.add(fieldId);
    for (const token of formulas.get(fieldId) ?? []) {
      if ("field" in token && token.period === "current" && visit(token.field)) return true;
    }
    visiting.delete(fieldId);
    done.add(fieldId);
    return false;
  }

  return [...formulas.keys()].some(visit);
}

const OPERATOR_SYMBOLS: Record<FormulaOperator, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };

export function operatorSymbol(operator: FormulaOperator): string {
  return OPERATOR_SYMBOLS[operator];
}

// The formula as readable text, e.g. "(Liikevoitto ÷ Liikevaihto) × 100". Field tokens and numbers
// are formatted by the caller, so names and number formats can be localized.
export function formatFormula(
  formula: Formula,
  format: { field: (fieldId: number, period: FormulaPeriod) => string; number: (value: number) => string },
): string {
  let text = "";
  let expectOperand = true;
  for (const token of formula) {
    if ("parenthesis" in token) {
      text += token.parenthesis === "(" ? `${expectOperand ? "" : " "}(` : ")";
    } else if ("operator" in token) {
      // A minus where an operand is expected is a negation, written without spaces around it.
      text += expectOperand ? operatorSymbol(token.operator) : ` ${operatorSymbol(token.operator)} `;
      expectOperand = true;
    } else {
      text += "number" in token ? format.number(token.number) : format.field(token.field, token.period);
      expectOperand = false;
    }
  }
  return text;
}
