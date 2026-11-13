import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CompanyPrediction } from "./estimates.ts";
import {
  annualReturn,
  averageValuePerShare,
  calculateValuation,
  fromStoredMultiple,
  presentValuation,
  priceMultiples,
  pricePotential,
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

describe("presentValuation", () => {
  it("discounts the market value and the value per share from the end of the target year", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const end = new Date(now.getTime() + 365.25 * 24 * 3600 * 1000);
    const present = presentValuation({ rows: [], averageMarketValue: 110, valuePerShare: 11 }, 10, end, now);
    assert.equal(Math.round(present.marketValue! * 1000) / 1000, 100);
    assert.equal(Math.round(present.valuePerShare! * 1000) / 1000, 10);
    assert.deepEqual(presentValuation({ rows: [], averageMarketValue: 110, valuePerShare: 11 }, null, end, now), {
      marketValue: null,
      valuePerShare: null,
    });
  });
});

describe("priceMultiples", () => {
  it("divides the market value, or the enterprise value with net debt, by the year's field", () => {
    const result = priceMultiples({
      multiples,
      prediction: prediction({ 1: 20 * M, 2: 12 * M, 3: 40 * M, 4: 10 * M, 5: null }),
      yearIds: [YEAR, YEAR + 1],
      price: 18,
      netDebtFieldId: 3,
      shareCountFieldId: 4,
    });
    assert.deepEqual(result, {
      1: { [YEAR]: 11, [YEAR + 1]: null },
      2: { [YEAR]: 15, [YEAR + 1]: null },
      3: { [YEAR]: null, [YEAR + 1]: null },
    });
  });

  it("has no value when the field is zero or net debt is missing", () => {
    const result = priceMultiples({
      multiples,
      prediction: prediction({ 1: 20 * M, 2: 0, 4: 10 * M }),
      yearIds: [YEAR],
      price: 18,
      netDebtFieldId: 3,
      shareCountFieldId: 4,
    });
    assert.deepEqual(result, { 1: { [YEAR]: null }, 2: { [YEAR]: null }, 3: { [YEAR]: null } });
  });
});

describe("averageValuePerShare", () => {
  it("averages the DCF and multiple values only when both are known", () => {
    assert.equal(averageValuePerShare(10, 14), 12);
    assert.equal(averageValuePerShare(10, null), null);
    assert.equal(averageValuePerShare(null, 14), null);
  });
});

describe("pricePotential", () => {
  it("is the value's change from the price, only when both are known", () => {
    assert.equal(pricePotential(15, 12), 0.25);
    assert.equal(pricePotential(9, 12), -0.25);
    assert.equal(pricePotential(null, 12), null);
    assert.equal(pricePotential(15, null), null);
    assert.equal(pricePotential(15, 0), null);
  });
});

describe("annualReturn", () => {
  it("compounds the potential over the years, only when it can be calculated", () => {
    assert.ok(Math.abs(annualReturn(14.4, 10, 2)! - 0.2) < 1e-12);
    assert.equal(annualReturn(5, 10, 1), -0.5);
    assert.equal(annualReturn(null, 10, 2), null);
    assert.equal(annualReturn(14.4, null, 2), null);
    assert.equal(annualReturn(14.4, 0, 2), null);
    assert.equal(annualReturn(14.4, 10, 0), null);
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
