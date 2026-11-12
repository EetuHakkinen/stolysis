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
const entered = { actualDefinition: null, estimateDefinition: null };

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
      { id: 1, estimateType: "relative", yearlyValue: "sum", ...entered },
      { id: 2, estimateType: "relative", yearlyValue: "sum", ...entered },
      { id: 3, estimateType: "absolute", yearlyValue: "last_period", ...entered },
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

describe("predictCompany with calculated fields", () => {
  const field = (id: number, period: "current" | "previous" = "current") => ({ field: id, period });
  const op = (operator: "+" | "-" | "*" | "/") => ({ operator });
  const ebit = [field(1), op("+"), field(2)];
  const margin = [field(3), op("/"), field(1), op("*"), { number: 100 }];
  const growth = [field(1), op("-"), field(1, "previous")];

  const quarters = (id: number, value: number) =>
    Object.fromEntries([1, 2, 3, 4].map((quarter) => [id * 10 + quarter, BigInt(value)]));
  // 2025 reported in full, 2026 Q1 reported, the rest estimated +10 % from a year earlier.
  const prediction = predictCompany({
    years,
    fields: [
      // Revenue and costs are estimated.
      { id: 1, estimateType: "relative", yearlyValue: "sum", ...entered },
      { id: 2, estimateType: "relative", yearlyValue: "sum", ...entered },
      // EBIT is reported, but calculated for estimates.
      { id: 3, estimateType: "relative", yearlyValue: "sum", actualDefinition: null, estimateDefinition: ebit },
      // Margin, revenue growth and a division by zero are always calculated. The margin comes first to
      // check that formulas are calculated after the fields they use.
      { id: 4, estimateType: "relative", yearlyValue: "sum", actualDefinition: margin, estimateDefinition: margin },
      { id: 5, estimateType: "relative", yearlyValue: "sum", actualDefinition: growth, estimateDefinition: growth },
      {
        id: 6,
        estimateType: "relative",
        yearlyValue: "sum",
        actualDefinition: [field(1), op("/"), { parenthesis: "(" }, field(2), op("-"), field(2), { parenthesis: ")" }],
        estimateDefinition: null,
      },
    ],
    actuals: {
      1: { ...quarters(2025, 100), 20261: BigInt(110) },
      2: { ...quarters(2025, -60), 20261: BigInt(-66) },
      3: { ...quarters(2025, 40), 20261: BigInt(44) },
    },
    estimates: [1, 2].flatMap((resultFieldId) =>
      [20262, 20263, 20264, 20271, 20272, 20273, 20274].map((reportingSeasonId) => ({
        resultFieldId,
        reportingSeasonId,
        financialYearId: null,
        value: 10,
      })),
    ),
  });
  const { quarterly, yearly } = prediction;
  const near = (actual: number | null, expected: number) => assert.ok(Math.abs(actual! - expected) < 1e-9);

  it("uses reported values of fields calculated only for estimates", () => {
    assert.deepEqual(quarterly[3][20251], { value: 40, source: "actual", change: null });
    assert.equal(quarterly[3][20261].value, 44);
    assert.deepEqual(yearly[3][2025], { value: 160, source: "actual", change: null });
  });

  it("calculates estimates from the fields' predicted values", () => {
    near(quarterly[3][20262].value, 110 - 66);
    assert.equal(quarterly[3][20262].source, "estimate");
    near(quarterly[3][20271].value, 121 - 72.6);
    near(quarterly[3][20262].change, 10);
  });

  it("calculates actual values from the fields' actual values", () => {
    near(quarterly[4][20251].value, 40);
    assert.equal(quarterly[4][20251].source, "actual");
    near(yearly[4][2025].value, 40);
    assert.equal(yearly[4][2025].source, "actual");
  });

  it("calculates years from the fields' yearly values", () => {
    near(yearly[3][2026].value, 440 - 264);
    assert.equal(yearly[3][2026].source, "estimate");
    // A margin isn't the sum of the quarters' margins.
    near(yearly[4][2026].value, 40);
  });

  it("uses the same period a year earlier for previous values", () => {
    // The first year has nothing to compare with.
    assert.equal(quarterly[5][20251].value, null);
    near(quarterly[5][20261].value, 10);
    assert.equal(quarterly[5][20261].source, "actual");
    near(yearly[5][2026].value, 40);
    assert.equal(yearly[5][2026].source, "estimate");
  });

  it("leaves the value empty when a field is missing or a division is by zero", () => {
    assert.equal(quarterly[6][20251].value, null);
    // Costs have no estimate for 2028, which is estimated as a whole.
    assert.equal(yearly[3][2028].value, null);
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
