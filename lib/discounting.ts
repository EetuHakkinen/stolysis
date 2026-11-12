// A company's discount variables and the cost of equity and WACC calculated from them. Pure, so it
// runs on the client as well as on the server: the calculated values are never saved.

import type { DiscountVariable } from "@/app/generated/prisma/client";

// Discount variables in display order. Beta is a plain number, the others are percentages.
export const DISCOUNT_VARIABLES: DiscountVariable[] = [
  "tax_rate",
  "target_debt_ratio",
  "cost_of_debt",
  "beta",
  "market_risk_premium",
  "liquidity_premium",
  "risk_free_rate",
  "terminal_growth",
];

export function isPercentVariable(variable: DiscountVariable): boolean {
  return variable !== "beta";
}

// Values by variable; missing or null when not set.
export type DiscountValues = Partial<Record<DiscountVariable, number | null>>;

// Values are stored in hundredths: percentages in hundredths of a percent, beta in hundredths.
const STORED_SCALE = 100;

export function roundDiscountValue(value: number): number {
  return Math.round(value * STORED_SCALE) / STORED_SCALE;
}

export function toStoredDiscountValue(value: number): number {
  return Math.round(value * STORED_SCALE);
}

export function fromStoredDiscountValue(value: number): number {
  return value / STORED_SCALE;
}

// Cost of equity in percent: risk-free rate + beta × market risk premium + liquidity premium.
export function costOfEquity(values: DiscountValues): number | null {
  const { risk_free_rate: riskFree, beta, market_risk_premium: premium, liquidity_premium: liquidity } = values;
  if (riskFree == null || beta == null || premium == null || liquidity == null) return null;
  return riskFree + beta * premium + liquidity;
}

// WACC in percent: the cost of equity and the after-tax cost of debt weighted by the target debt
// ratio, D / (D + E).
export function wacc(values: DiscountValues): number | null {
  const equity = costOfEquity(values);
  const { target_debt_ratio: debtRatio, cost_of_debt: debtCost, tax_rate: tax } = values;
  if (equity == null || debtRatio == null || debtCost == null || tax == null) return null;
  const debtWeight = debtRatio / 100;
  return debtWeight * debtCost * (1 - tax / 100) + (1 - debtWeight) * equity;
}
