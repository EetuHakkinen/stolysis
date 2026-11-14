// A company's DCF value in an estimate scenario from the predicted operating free cash flows of the
// years after the current financial year. Pure, so it runs on the client as well as on the server:
// like predicted values, the DCF value is never saved. Values are in whole euros.

import type { ResultFieldType } from "@/app/generated/prisma/client";
import type { CompanyPrediction, EstimateYear } from "@/lib/estimates";
import { presentValue, yearsUntil } from "./valuation.ts";

// Ids of the company's fields with the special types the DCF uses; null if it doesn't have one.
export type DcfFieldIds = Record<
  Extract<
    ResultFieldType,
    | "ebit"
    | "depreciation"
    | "goodwill_amortization"
    | "taxes_paid"
    | "working_capital_change"
    | "capital_expenditure"
    | "operating_free_cash_flow"
    | "net_debt"
    | "dividend"
    | "share_count"
  >,
  number | null
>;

// One discounted year's cash flow, each part with the sign of its effect on the cash flow:
// depreciation and goodwill amortization are added back, taxes, growth of working capital and
// investments are negative.
export type DcfYear = {
  yearId: number;
  ebit: number | null;
  depreciation: number | null;
  // Zero when the company has no goodwill amortization field or no value for the year.
  goodwillAmortization: number;
  taxesPaid: number | null;
  workingCapitalChange: number | null;
  // EBIT + depreciation + goodwill amortization + taxes paid + change in working capital.
  operatingCashFlow: number | null;
  capitalExpenditure: number | null;
  // The operating free cash flow field's value, which is what's discounted.
  freeCashFlow: number | null;
  discountedFreeCashFlow: number | null;
  // Sum of the discounted free cash flows up to the year; null after a missing one.
  cumulativeDiscountedFreeCashFlow: number | null;
};

export type DcfTerminal = {
  // The last year's free cash flow grown by the terminal growth.
  freeCashFlow: number | null;
  // The terminal value, FCF × (1 + g) / (WACC − g), discounted.
  discountedValue: number | null;
};

export type DcfResult = {
  // The current financial year's cash flow for reference; it isn't discounted, so its discounted
  // values are null.
  currentYear: DcfYear | null;
  years: DcfYear[];
  terminal: DcfTerminal;
  // Discounted cash flows plus the discounted terminal value.
  enterpriseValue: number | null;
  // Net debt at the end of the current financial year.
  netDebt: number | null;
  // Dividend or capital return paid in the next financial year, as a positive amount; zero without
  // one.
  dividend: number;
  // Enterprise value less net debt and the dividend.
  equityValue: number | null;
  // Equity value divided by the share count at the end of the current financial year.
  valuePerShare: number | null;
};

// Each year after the current financial year up to the last one has its operating free cash flow
// discounted with the WACC from now to the middle of the year. The terminal value, the last year's
// cash flow growing at the terminal growth forever, FCF × (1 + g) / (WACC − g), is discounted from
// the end of the last year. Without a year to discount, any of their cash flows, the WACC or the
// terminal growth, or when the WACC doesn't exceed the terminal growth, there's no enterprise value.
export function calculateDcf({
  years,
  currentYearId,
  prediction,
  fieldIds,
  wacc,
  terminalGrowth,
  now,
}: {
  // Financial years in order, at least up to the last one to discount.
  years: EstimateYear[];
  currentYearId: number;
  prediction: CompanyPrediction;
  fieldIds: DcfFieldIds;
  // Percentages.
  wacc: number | null;
  terminalGrowth: number | null;
  now: Date;
}): DcfResult {
  const current = years.findIndex((year) => year.id === currentYearId);
  const currentYear = years[current];
  const value = (fieldId: number | null, year: EstimateYear | undefined) =>
    fieldId == null || year == null ? null : (prediction.yearly[fieldId]?.[year.id]?.value ?? null);
  const negated = (value: number | null) => (value == null ? null : -value);
  const sum = (...values: (number | null)[]) =>
    values.some((value) => value == null) ? null : values.reduce<number>((total, value) => total + value!, 0);

  // The year's cash flow, not yet discounted.
  const cashFlow = (year: EstimateYear): DcfYear => {
    const ebit = value(fieldIds.ebit, year);
    // Depreciation is a negative cost in the income statement.
    const depreciation = negated(value(fieldIds.depreciation, year));
    // Goodwill amortization is as well, and many companies don't have it.
    const goodwillAmortization = 0 - (value(fieldIds.goodwill_amortization, year) ?? 0);
    const taxesPaid = value(fieldIds.taxes_paid, year);
    const workingCapitalChange = value(fieldIds.working_capital_change, year);
    return {
      yearId: year.id,
      ebit,
      depreciation,
      goodwillAmortization,
      taxesPaid,
      workingCapitalChange,
      operatingCashFlow: sum(ebit, depreciation, goodwillAmortization, taxesPaid, workingCapitalChange),
      capitalExpenditure: value(fieldIds.capital_expenditure, year),
      freeCashFlow: value(fieldIds.operating_free_cash_flow, year),
      discountedFreeCashFlow: null,
      cumulativeDiscountedFreeCashFlow: null,
    };
  };

  const discounted = current < 0 ? [] : years.slice(current + 1);
  let cumulative: number | null = 0;
  const dcfYears = discounted.map((year, index): DcfYear => {
    const undiscounted = cashFlow(year);
    const start = (index === 0 ? currentYear : discounted[index - 1]).endTime.getTime();
    const middle = new Date(start + (year.endTime.getTime() - start) / 2);
    const discountedFreeCashFlow = presentValue(undiscounted.freeCashFlow, wacc, yearsUntil(middle, now));
    cumulative = sum(cumulative, discountedFreeCashFlow);
    return { ...undiscounted, discountedFreeCashFlow, cumulativeDiscountedFreeCashFlow: cumulative };
  });

  const last = discounted.at(-1);
  const lastCashFlow = dcfYears.at(-1)?.freeCashFlow ?? null;
  const terminalCashFlow =
    lastCashFlow == null || terminalGrowth == null ? null : lastCashFlow * (1 + terminalGrowth / 100);
  const terminalValue =
    terminalCashFlow == null || wacc == null || wacc <= terminalGrowth!
      ? null
      : terminalCashFlow / ((wacc - terminalGrowth!) / 100);
  const discountedTerminalValue = last ? presentValue(terminalValue, wacc, yearsUntil(last.endTime, now)) : null;
  const enterpriseValue = dcfYears.length === 0 ? null : sum(cumulative, discountedTerminalValue);

  const netDebt = value(fieldIds.net_debt, currentYear);
  const dividend = Math.abs(value(fieldIds.dividend, years[current + 1]) ?? 0);
  const shareCount = value(fieldIds.share_count, currentYear);
  const equityValue = enterpriseValue == null || netDebt == null ? null : enterpriseValue - netDebt - dividend;
  const valuePerShare = equityValue == null || !shareCount ? null : equityValue / shareCount;

  return {
    currentYear: currentYear ? cashFlow(currentYear) : null,
    years: dcfYears,
    terminal: { freeCashFlow: terminalCashFlow, discountedValue: discountedTerminalValue },
    enterpriseValue,
    netDebt,
    dividend,
    equityValue,
    valuePerShare,
  };
}

// A part of the enterprise value: the discounted free cash flows of some years, or the discounted
// terminal value when yearIds is null.
export type DcfValuePart = {
  yearIds: number[] | null;
  value: number;
  // Percent of the enterprise value.
  share: number;
};

// The enterprise value split into the first and the second half of the discounted years (the
// first gets the extra year of an odd count) and the terminal value. Empty without an enterprise
// value; a half without years is left out.
export function dcfValueParts(dcf: DcfResult): DcfValuePart[] {
  const { enterpriseValue, years, terminal } = dcf;
  if (enterpriseValue == null || enterpriseValue === 0 || terminal.discountedValue == null) return [];
  const half = Math.ceil(years.length / 2);
  const share = (value: number) => (value / enterpriseValue) * 100;
  const parts: DcfValuePart[] = [years.slice(0, half), years.slice(half)]
    .filter((part) => part.length > 0)
    .map((part) => {
      const value = part.reduce((total, year) => total + year.discountedFreeCashFlow!, 0);
      return { yearIds: part.map((year) => year.yearId), value, share: share(value) };
    });
  return [...parts, { yearIds: null, value: terminal.discountedValue, share: share(terminal.discountedValue) }];
}
