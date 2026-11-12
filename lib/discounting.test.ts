import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { costOfEquity, fromStoredDiscountValue, toStoredDiscountValue, wacc } from "./discounting.ts";

const values = {
  tax_rate: 20,
  target_debt_ratio: 25,
  cost_of_debt: 5,
  beta: 1.2,
  market_risk_premium: 5,
  liquidity_premium: 1,
  risk_free_rate: 2.5,
  terminal_growth: 2,
};

describe("costOfEquity", () => {
  it("adds the risk-free rate, beta times the market risk premium and the liquidity premium", () => {
    assert.equal(costOfEquity(values), 9.5);
  });

  it("is empty when a variable is missing", () => {
    assert.equal(costOfEquity({ ...values, beta: null }), null);
  });
});

describe("wacc", () => {
  it("weights the cost of equity and the after-tax cost of debt", () => {
    // 0.25 × 5 × 0.8 + 0.75 × 9.5
    assert.equal(wacc(values), 8.125);
  });

  it("is empty when a variable is missing", () => {
    assert.equal(wacc({ ...values, tax_rate: undefined }), null);
    assert.equal(wacc({ ...values, risk_free_rate: null }), null);
  });
});

describe("stored discount values", () => {
  it("stores values in hundredths", () => {
    assert.equal(toStoredDiscountValue(8.505), 851);
    assert.equal(fromStoredDiscountValue(120), 1.2);
  });
});
