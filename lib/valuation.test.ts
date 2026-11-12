import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CompanyPrediction } from "./estimates.ts";
import {
  calculateValuation,
  fromStoredMultiple,
  presentValue,
  roundMultiple,
  toStoredMultiple,
  yearsUntil,
} from "./valuation.ts";

const M = 1_000_000;
const YEAR = 2027;

// Fields: 1 = EBIT, 2 = net profit, 3 = net debt, 4 = share count, 5 = empty.
function prediction(values: Record<number, number | null>): CompanyPrediction {
  return {
    quarterly: {},
    yearly: Object.fromEntries(
      Object.entries(values).map(([fieldId, value]) => [
        fieldId,
        { [YEAR]: { value, source: "estimate", change: null } },
      ]),
    ),
  };
}

const multiples = [
  { id: 1, resultFieldId: 1, basis: "enterprise_value" as const },
  { id: 2, resultFieldId: 2, basis: "market_value" as const },
  { id: 3, resultFieldId: 5, basis: "market_value" as const },
];

describe("calculateValuation", () => {
  const input = {
    multiples,
    values: { 1: 10, 2: 15, 3: 8 },
    prediction: prediction({ 1: 20 * M, 2: 12 * M, 3: 40 * M, 4: 10 * M, 5: null }),
    targetYearId: YEAR,
    netDebtFieldId: 3,
    shareCountFieldId: 4,
  };

  it("subtracts net debt from the enterprise value", () => {
    const { rows } = calculateValuation(input);
    assert.deepEqual(rows[0], { multipleId: 1, enterpriseValue: 200 * M, marketValue: 160 * M });
  });

  it("multiplies market value based multiples directly", () => {
    const { rows } = calculateValuation(input);
    assert.deepEqual(rows[1], { multipleId: 2, enterpriseValue: null, marketValue: 180 * M });
  });

  it("averages the market values that exist and divides by the share count", () => {
    const result = calculateValuation(input);
    assert.deepEqual(result.rows[2], { multipleId: 3, enterpriseValue: null, marketValue: null });
    assert.equal(result.averageMarketValue, 170 * M);
    assert.equal(result.valuePerShare, 17);
  });

  it("leaves values empty without a multiple value, net debt or share count", () => {
    const result = calculateValuation({
      ...input,
      values: { 1: 10, 2: null },
      netDebtFieldId: null,
      shareCountFieldId: null,
    });
    assert.deepEqual(result.rows[0], { multipleId: 1, enterpriseValue: 200 * M, marketValue: null });
    assert.equal(result.rows[1].marketValue, null);
    assert.equal(result.averageMarketValue, null);
    assert.equal(result.valuePerShare, null);
  });
});

describe("presentValue", () => {
  it("discounts with the annual rate over fractional years", () => {
    const rounded = (value: number | null) => Math.round(value! * 1000) / 1000;
    assert.equal(rounded(presentValue(110, 10, 1)), 100);
    assert.equal(rounded(presentValue(100, 10, 1.5)), 86.678);
    assert.equal(presentValue(100, 10, 0), 100);
  });

  it("is empty without a value or a rate", () => {
    assert.equal(presentValue(null, 10, 1), null);
    assert.equal(presentValue(100, null, 1), null);
  });
});

describe("yearsUntil", () => {
  it("counts years as a fraction and stops at zero", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    assert.equal(yearsUntil(new Date(now.getTime() + 365.25 * 2 * 24 * 3600 * 1000), now), 2);
    assert.equal(yearsUntil(new Date("2025-12-31T00:00:00Z"), now), 0);
  });
});

describe("stored multiples", () => {
  it("stores multiples in hundredths", () => {
    assert.equal(toStoredMultiple(12.345), 1235);
    assert.equal(fromStoredMultiple(1235), 12.35);
    assert.equal(roundMultiple(12.344), 12.34);
  });
});
