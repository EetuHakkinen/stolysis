import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { predictCompany, seasonsWithData, type EstimateYear } from "./estimates.ts";

const M = 1_000_000;

// 2025 actual, 2026 Q1 reported, 2026–2027 summed from quarters, 2028 estimated as a whole.
function year(id: number, fromSeasons: boolean): EstimateYear {
  return {
    id,
    name: String(id),
    unit: "million",
    endTime: new Date(`${id}-12-31T22:00:00Z`),
    fromSeasons,
    seasons: [1, 2, 3, 4].map((quarter) => ({ id: id * 10 + quarter, name: `Q${quarter}` })),
  };
}
const years = [year(2025, true), year(2026, true), year(2027, true), year(2028, false)];

const actuals = {
  // Revenue: 100 per quarter in 2025, 110 in 2026 Q1.
  1: { 20251: BigInt(100 * M), 20252: BigInt(100 * M), 20253: BigInt(100 * M), 20254: BigInt(100 * M), 20261: BigInt(110 * M) },
  // Costs: reported only for 2025 Q1; the other quarters still have data through revenue.
  2: { 20251: BigInt(-50 * M), 20261: null },
  // Net debt at the end of each quarter in 2025.
  3: { 20251: BigInt(10 * M), 20252: BigInt(11 * M), 20253: BigInt(12 * M), 20254: BigInt(13 * M) },
};

describe("seasonsWithData", () => {
  it("counts seasons where any field has a value", () => {
    assert.deepEqual([...seasonsWithData(actuals)].sort(), [20251, 20252, 20253, 20254, 20261]);
  });
});

describe("predictCompany", () => {
  const prediction = predictCompany({
    years,
    fields: [
      { id: 1, estimateType: "relative", yearlyValue: "sum" },
      { id: 2, estimateType: "relative", yearlyValue: "sum" },
      { id: 3, estimateType: "absolute", yearlyValue: "last_period" },
    ],
    actuals,
    estimates: [
      ...[20262, 20263, 20264, 20271, 20272, 20273, 20274].map((id) => ({
        resultFieldId: 1,
        reportingSeasonId: id,
        financialYearId: null,
        value: 10,
      })),
      { resultFieldId: 1, reportingSeasonId: null, financialYearId: 2028, value: -5 },
      { resultFieldId: 2, reportingSeasonId: 20262, financialYearId: null, value: 10 },
      // Net debt: absolute estimates for the rest of 2026, only Q4 for 2027.
      ...[20262, 20263, 20264].map((id) => ({
        resultFieldId: 3,
        reportingSeasonId: id,
        financialYearId: null,
        value: (id - 20250) * M,
      })),
      { resultFieldId: 3, reportingSeasonId: 20274, financialYearId: null, value: 30 * M },
    ],
  });
  const revenue = prediction.quarterly[1];

  it("uses actual values in seasons with data", () => {
    assert.equal(revenue[20261].value, 110 * M);
    assert.equal(revenue[20261].source, "actual");
    assert.equal(Math.round(revenue[20261].change!), 10);
  });

  it("changes the comparison period by a relative estimate", () => {
    assert.equal(Math.round(revenue[20262].value!), 110 * M);
    assert.equal(revenue[20262].source, "estimate");
    // Next year compares with the predicted and reported values of this year.
    assert.equal(Math.round(revenue[20271].value!), 121 * M);
    assert.equal(Math.round(revenue[20272].value!), 121 * M);
  });

  it("sums quarters into years", () => {
    assert.deepEqual(prediction.yearly[1][2025], { value: 400 * M, source: "actual", change: null });
    assert.equal(Math.round(prediction.yearly[1][2026].value!), 440 * M);
    assert.equal(prediction.yearly[1][2026].source, "estimate");
    assert.equal(Math.round(prediction.yearly[1][2027].value!), 484 * M);
  });

  it("uses the last quarter as the year's value for last_period fields", () => {
    assert.deepEqual(prediction.yearly[3][2025], { value: 13 * M, source: "actual", change: null });
    assert.equal(prediction.yearly[3][2026].value, 14 * M);
    assert.equal(prediction.yearly[3][2026].source, "estimate");
    // Only the last quarter matters, even if earlier ones are empty.
    assert.equal(prediction.yearly[3][2027].value, 30 * M);
  });

  it("estimates later years against the previous year's total", () => {
    assert.equal(Math.round(prediction.yearly[1][2028].value!), 459.8 * M);
    assert.equal(Math.round(prediction.yearly[1][2028].change!), -5);
  });

  it("leaves periods empty without an estimate or a value to compare with", () => {
    const costs = prediction.quarterly[2];
    // Missing actual value in a season with data.
    assert.equal(costs[20252].value, null);
    // Estimate, but the comparison period is empty.
    assert.equal(costs[20262].value, null);
    // No estimate.
    assert.equal(costs[20263].value, null);
    // A year with an empty quarter is empty.
    assert.equal(prediction.yearly[2][2026].value, null);
  });
});

describe("stored estimates", () => {
  it("stores relative estimates in hundredths of a percent and absolute ones in euros", async () => {
    const { fromStoredEstimate, roundEstimate, toStoredEstimate } = await import("./estimates.ts");
    assert.equal(toStoredEstimate("relative", 3.48), BigInt(348));
    assert.equal(fromStoredEstimate("relative", BigInt(348)), 3.48);
    assert.equal(roundEstimate("relative", 3.456), 3.46);
    assert.equal(toStoredEstimate("absolute", 1_234_567.6), BigInt(1_234_568));
    assert.equal(roundEstimate("absolute", 1_234_567.4), 1_234_567);
  });
});
