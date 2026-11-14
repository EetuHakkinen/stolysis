import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateDcf, dcfValueParts, type DcfFieldIds } from "./dcf.ts";
import type { CompanyPrediction, EstimateYear } from "./estimates.ts";

function year(id: number): EstimateYear {
  return { id, name: String(id), unit: "million", endTime: new Date(`${id}-12-31T22:00:00Z`), seasons: [], fromSeasons: false };
}
const years = [year(2025), year(2026), year(2027), year(2028)];
// The end of the current financial year 2026, so 2027 is discounted half a year and 2028 one and a half.
const now = new Date("2026-12-31T22:00:00Z");
const fieldIds: DcfFieldIds = {
  operating_free_cash_flow: 1,
  net_debt: 2,
  dividend: 3,
  share_count: 4,
  ebit: 5,
  depreciation: 6,
  goodwill_amortization: 10,
  taxes_paid: 7,
  working_capital_change: 8,
  capital_expenditure: 9,
};

function prediction(yearly: Record<number, Record<number, number | null>>): CompanyPrediction {
  return {
    quarterly: {},
    yearly: Object.fromEntries(
      Object.entries(yearly).map(([fieldId, values]) => [
        fieldId,
        Object.fromEntries(
          Object.entries(values).map(([yearId, value]) => [yearId, { value, source: "estimate", change: null }]),
        ),
      ]),
    ),
  };
}

const values = {
  // The current year's cash flow is already in its net debt, so it isn't discounted.
  1: { 2026: 1000, 2027: 100, 2028: 110 },
  2: { 2026: 50, 2027: 0 },
  // Paid out of 2026's result in 2027, entered as cash out.
  3: { 2026: -999, 2027: -20 },
  4: { 2026: 10, 2027: 999 },
  // 2027: 150 + 30 + 10 − 25 − 15 = 150 operating cash flow, less 50 investments = 100.
  5: { 2026: 140, 2027: 150 },
  6: { 2027: -30 },
  7: { 2027: -25 },
  8: { 2027: -15 },
  9: { 2027: -50 },
  10: { 2027: -10 },
};
const near = (actual: number | null, expected: number) =>
  assert.ok(Math.abs(actual! - expected) < Math.abs(expected) * 1e-3, `${actual} ≉ ${expected}`);

describe("calculateDcf", () => {
  const input = { years, currentYearId: 2026, fieldIds, wacc: 10, terminalGrowth: 2, now };
  const terminalValue = (110 * 1.02) / 0.08;
  const enterpriseValue = 100 / 1.1 ** 0.5 + 110 / 1.1 ** 1.5 + terminalValue / 1.1 ** 2;

  it("discounts the cash flows of the years after the current one mid-year and the terminal value from the last year's end", () => {
    const result = calculateDcf({ ...input, prediction: prediction(values) });
    near(result.enterpriseValue, enterpriseValue);
    assert.equal(result.netDebt, 50);
    assert.equal(result.dividend, 20);
    near(result.equityValue, enterpriseValue - 50 - 20);
    near(result.valuePerShare, (enterpriseValue - 70) / 10);
  });

  it("shows each year's cash flow with the signs of its effects", () => {
    const { years: dcfYears, terminal } = calculateDcf({ ...input, prediction: prediction(values) });
    assert.deepEqual(
      dcfYears.map((year) => year.yearId),
      [2027, 2028],
    );
    const [first, second] = dcfYears;
    assert.equal(first.ebit, 150);
    assert.equal(first.depreciation, 30);
    assert.equal(first.goodwillAmortization, 10);
    assert.equal(first.taxesPaid, -25);
    assert.equal(first.workingCapitalChange, -15);
    assert.equal(first.operatingCashFlow, 150);
    assert.equal(first.capitalExpenditure, -50);
    assert.equal(first.freeCashFlow, 100);
    near(first.discountedFreeCashFlow, 100 / 1.1 ** 0.5);
    near(second.cumulativeDiscountedFreeCashFlow, 100 / 1.1 ** 0.5 + 110 / 1.1 ** 1.5);
    // A missing goodwill amortization counts as zero, other missing parts leave the operating cash
    // flow empty.
    assert.equal(second.goodwillAmortization, 0);
    assert.equal(second.operatingCashFlow, null);
    near(terminal.freeCashFlow, 110 * 1.02);
    near(terminal.discountedValue, terminalValue / 1.1 ** 2);
  });

  it("counts goodwill amortization as zero when the company has no field for it", () => {
    const { years: dcfYears } = calculateDcf({
      ...input,
      fieldIds: { ...fieldIds, goodwill_amortization: null },
      prediction: prediction(values),
    });
    assert.equal(dcfYears[0].goodwillAmortization, 0);
    assert.equal(dcfYears[0].operatingCashFlow, 140);
  });

  it("shows the current year's cash flow without discounting it", () => {
    const { currentYear } = calculateDcf({ ...input, prediction: prediction(values) });
    assert.equal(currentYear?.yearId, 2026);
    assert.equal(currentYear?.ebit, 140);
    assert.equal(currentYear?.freeCashFlow, 1000);
    assert.equal(currentYear?.discountedFreeCashFlow, null);
    assert.equal(currentYear?.cumulativeDiscountedFreeCashFlow, null);
  });

  it("counts a missing dividend as zero", () => {
    const result = calculateDcf({ ...input, prediction: prediction({ ...values, 3: {} }) });
    assert.equal(result.dividend, 0);
    near(result.equityValue, result.enterpriseValue! - 50);
  });

  it("has no enterprise value without every cash flow, the rates or a WACC above the terminal growth", () => {
    const missingCashFlow = calculateDcf({ ...input, prediction: prediction({ ...values, 1: { 2027: null, 2028: 110 } }) });
    assert.equal(missingCashFlow.enterpriseValue, null);
    assert.equal(missingCashFlow.equityValue, null);
    assert.equal(missingCashFlow.netDebt, 50);
    // Later years are discounted, but there's no cumulative value after the missing one.
    assert.notEqual(missingCashFlow.years[1].discountedFreeCashFlow, null);
    assert.equal(missingCashFlow.years[1].cumulativeDiscountedFreeCashFlow, null);
    assert.equal(calculateDcf({ ...input, wacc: null, prediction: prediction(values) }).enterpriseValue, null);
    assert.equal(calculateDcf({ ...input, terminalGrowth: null, prediction: prediction(values) }).enterpriseValue, null);
    const lowWacc = calculateDcf({ ...input, wacc: 2, prediction: prediction(values) });
    assert.equal(lowWacc.enterpriseValue, null);
    assert.equal(lowWacc.terminal.discountedValue, null);
    // No years after the current one.
    assert.equal(calculateDcf({ ...input, currentYearId: 2028, prediction: prediction(values) }).enterpriseValue, null);
  });

  it("leaves out what depends on a missing net debt or share count", () => {
    const result = calculateDcf({ ...input, prediction: prediction({ ...values, 2: {}, 4: {} }) });
    assert.notEqual(result.enterpriseValue, null);
    assert.equal(result.equityValue, null);
    assert.equal(result.valuePerShare, null);
    const noShares = calculateDcf({ ...input, prediction: prediction({ ...values, 4: {} }) });
    assert.notEqual(noShares.equityValue, null);
    assert.equal(noShares.valuePerShare, null);
  });
});

describe("dcfValueParts", () => {
  const input = { years, currentYearId: 2025, fieldIds, wacc: 10, terminalGrowth: 2, now };

  it("splits the enterprise value into the halves of the years and the terminal value", () => {
    // 2026–2028 are discounted: the first half gets the extra year.
    const dcf = calculateDcf({ ...input, prediction: prediction({ 1: { 2026: 90, 2027: 100, 2028: 110 } }) });
    const parts = dcfValueParts(dcf);
    assert.deepEqual(
      parts.map((part) => part.yearIds),
      [[2026, 2027], [2028], null],
    );
    near(parts[0].value, dcf.years[0].discountedFreeCashFlow! + dcf.years[1].discountedFreeCashFlow!);
    near(parts[2].value, dcf.terminal.discountedValue!);
    near(
      parts.reduce((total, part) => total + part.share, 0),
      100,
    );
    near(parts[1].share, (dcf.years[2].discountedFreeCashFlow! / dcf.enterpriseValue!) * 100);
  });

  it("is empty without an enterprise value", () => {
    assert.deepEqual(dcfValueParts(calculateDcf({ ...input, wacc: null, prediction: prediction(values) })), []);
  });
});
