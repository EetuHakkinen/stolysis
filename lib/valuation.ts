// A company's valuation in an estimate scenario from its valuation multiples and the predicted
// values of the target year. Pure, so it runs on the client as well as on the server: like
// predicted values, the valuation is never saved. Values are in whole euros.

import type { ValuationBasis } from "@/app/generated/prisma/client";
import type { CompanyPrediction } from "@/lib/estimates";

export type ValuationMultipleInput = { id: number; resultFieldId: number; basis: ValuationBasis };

export type ValuationRow = {
  multipleId: number;
  // Null for market value based multiples and when a value is missing.
  enterpriseValue: number | null;
  marketValue: number | null;
};

export type CompanyValuationResult = {
  rows: ValuationRow[];
  // Average of the multiples' market values, null if none has one.
  averageMarketValue: number | null;
  // Average market value divided by the share count.
  valuePerShare: number | null;
};

// Multiple values are stored in hundredths (1250 = 12.50).
const STORED_SCALE = 100;

export function roundMultiple(value: number): number {
  return Math.round(value * STORED_SCALE) / STORED_SCALE;
}

export function toStoredMultiple(value: number): number {
  return Math.round(value * STORED_SCALE);
}

export function fromStoredMultiple(value: number): number {
  return value / STORED_SCALE;
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

// Years from now until the given time as a fraction, zero if it has passed.
export function yearsUntil(time: Date, now: Date): number {
  return Math.max(0, (time.getTime() - now.getTime()) / YEAR_MS);
}

// Value discounted to the present over the given years with an annual rate in percent.
export function presentValue(value: number | null, ratePercent: number | null, years: number): number | null {
  if (value == null || ratePercent == null) return null;
  return value / (1 + ratePercent / 100) ** years;
}

// Each multiple's value times its field's value in the target year gives the enterprise value or
// the market value. The market value is the enterprise value less net debt. A multiple without a
// value, or whose inputs are missing, has no market value and is left out of the average.
export function calculateValuation({
  multiples,
  values,
  prediction,
  targetYearId,
  netDebtFieldId,
  shareCountFieldId,
}: {
  multiples: ValuationMultipleInput[];
  // Multiple values by multiple id.
  values: Record<number, number | null | undefined>;
  prediction: CompanyPrediction;
  targetYearId: number;
  netDebtFieldId: number | null;
  shareCountFieldId: number | null;
}): CompanyValuationResult {
  const yearValue = (fieldId: number | null) =>
    fieldId == null ? null : (prediction.yearly[fieldId]?.[targetYearId]?.value ?? null);
  const netDebt = yearValue(netDebtFieldId);

  const rows = multiples.map((multiple): ValuationRow => {
    const value = values[multiple.id];
    const base = yearValue(multiple.resultFieldId);
    const result = value == null || base == null ? null : value * base;
    if (multiple.basis === "market_value")
      return { multipleId: multiple.id, enterpriseValue: null, marketValue: result };
    return {
      multipleId: multiple.id,
      enterpriseValue: result,
      marketValue: result == null || netDebt == null ? null : result - netDebt,
    };
  });

  const marketValues = rows.flatMap((row) => (row.marketValue == null ? [] : [row.marketValue]));
  const averageMarketValue =
    marketValues.length === 0 ? null : marketValues.reduce((sum, value) => sum + value, 0) / marketValues.length;
  const shareCount = yearValue(shareCountFieldId);
  const valuePerShare =
    averageMarketValue == null || !shareCount ? null : averageMarketValue / shareCount;

  return { rows, averageMarketValue, valuePerShare };
}

// The multiples the stock price gives in each of the years, by multiple id and then by year id: the
// market value is the price times the year's share count, and the enterprise value adds the year's
// net debt to it. Each is divided by the multiple's field in the year. Null when a value is
// missing or the field is zero.
export function priceMultiples({
  multiples,
  prediction,
  yearIds,
  price,
  netDebtFieldId,
  shareCountFieldId,
}: {
  multiples: ValuationMultipleInput[];
  prediction: CompanyPrediction;
  yearIds: number[];
  price: number;
  netDebtFieldId: number | null;
  shareCountFieldId: number | null;
}): Record<number, Record<number, number | null>> {
  const yearValue = (fieldId: number | null, yearId: number) =>
    fieldId == null ? null : (prediction.yearly[fieldId]?.[yearId]?.value ?? null);

  return Object.fromEntries(
    multiples.map((multiple) => [
      multiple.id,
      Object.fromEntries(
        yearIds.map((yearId) => {
          const shareCount = yearValue(shareCountFieldId, yearId);
          const base = yearValue(multiple.resultFieldId, yearId);
          const netDebt = yearValue(netDebtFieldId, yearId);
          const marketValue = shareCount == null ? null : price * shareCount;
          const value =
            multiple.basis === "market_value"
              ? marketValue
              : marketValue == null || netDebt == null
                ? null
                : marketValue + netDebt;
          return [yearId, value == null || !base ? null : value / base];
        }),
      ),
    ]),
  );
}

// The target year's market value and value per share discounted to the present with the cost of
// equity, from now until the end of the target year.
export function presentValuation(
  valuation: CompanyValuationResult,
  costOfEquity: number | null,
  targetYearEnd: Date,
  now: Date,
): { marketValue: number | null; valuePerShare: number | null } {
  const years = yearsUntil(targetYearEnd, now);
  return {
    marketValue: presentValue(valuation.averageMarketValue, costOfEquity, years),
    valuePerShare: presentValue(valuation.valuePerShare, costOfEquity, years),
  };
}

// Average of the DCF value and the multiple based value per share; null unless both are known.
export function averageValuePerShare(dcf: number | null, multiples: number | null): number | null {
  return dcf == null || multiples == null ? null : (dcf + multiples) / 2;
}

// How much the stock price would change to reach the value per share, as a fraction of the price
// (0.25 = +25 %); null unless both are known and the price is positive.
export function pricePotential(valuePerShare: number | null, price: number | null): number | null {
  return valuePerShare == null || price == null || price <= 0 ? null : valuePerShare / price - 1;
}

// The yearly return, compounded, that takes the stock price to the value per share in the given
// years (0.1 = 10 % a year); null unless both are known, the price is positive and years remain.
export function annualReturn(valuePerShare: number | null, price: number | null, years: number): number | null {
  if (valuePerShare == null || price == null || price <= 0 || years <= 0) return null;
  return (valuePerShare / price) ** (1 / years) - 1;
}
