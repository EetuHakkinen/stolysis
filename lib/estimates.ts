// Predicted values of a company's result fields in an estimate scenario. Pure, so it runs on the
// client as well as on the server: predicted values are never saved, only estimate variables are.
// Values are in whole euros as numbers, since relative estimates produce fractions.

import type { EstimateType, Unit } from "@/app/generated/prisma/client";

export type EstimateSeason = { id: number; name: string | null };

export type EstimateYear = {
  id: number;
  name: string | null;
  unit: Unit | null;
  // Reporting seasons in order.
  seasons: EstimateSeason[];
  // The year's total is the sum of its seasons; otherwise the year is estimated as a whole.
  fromSeasons: boolean;
};

export type EstimateField = { id: number; estimateType: EstimateType };

// Current estimate variable of a field for one period (exactly one of the period ids is set):
// relative is a percent change, absolute a value in whole euros. Null clears the estimate.
export type EstimateInput = {
  resultFieldId: number;
  reportingSeasonId: number | null;
  financialYearId: number | null;
  value: number | null;
};

// Actual values in whole euros by result field id and reporting season id.
export type ActualValues = Record<number, Record<number, bigint | null>>;

export type PeriodValue = {
  // Actual or predicted value in whole euros.
  value: number | null;
  source: "actual" | "estimate" | null;
  // Percent change compared to the same period a year earlier.
  change: number | null;
};

// Values by result field id, then by reporting season id (quarterly) or financial year id (yearly).
export type CompanyPrediction = {
  quarterly: Record<number, Record<number, PeriodValue>>;
  yearly: Record<number, Record<number, PeriodValue>>;
};

const EMPTY: PeriodValue = { value: null, source: null, change: null };

// Relative estimates are stored in hundredths of a percent (348 = +3.48 %), absolute ones in whole
// euros like result values.
const STORED_SCALE: Record<EstimateType, number> = { relative: 100, absolute: 1 };

// Estimate variable rounded to what can be stored: two decimals of a percent or whole euros.
export function roundEstimate(type: EstimateType, value: number): number {
  return Math.round(value * STORED_SCALE[type]) / STORED_SCALE[type];
}

export function toStoredEstimate(type: EstimateType, value: number): bigint {
  return BigInt(Math.round(value * STORED_SCALE[type]));
}

export function fromStoredEstimate(type: EstimateType, value: bigint): number {
  return Number(value) / STORED_SCALE[type];
}

// Reporting seasons with any data: at least one field's latest value isn't null. In those seasons
// every field uses its actual value, and no estimates are needed.
export function seasonsWithData(actuals: ActualValues): Set<number> {
  const seasons = new Set<number>();
  for (const values of Object.values(actuals)) {
    for (const [seasonId, value] of Object.entries(values)) {
      if (value != null) seasons.add(Number(seasonId));
    }
  }
  return seasons;
}

// The season a year earlier in the same position, when the previous year is divided the same way.
export function comparisonSeason(
  previousYear: EstimateYear | undefined,
  year: EstimateYear,
  index: number,
): EstimateSeason | undefined {
  if (previousYear?.seasons.length !== year.seasons.length) return undefined;
  return previousYear.seasons[index];
}

// Percent change from the comparison value to the value. A relative estimate is its inverse:
// value = comparison × (1 + change / 100), also when the values are negative.
function percentChange(value: number | null, comparison: number | null): number | null {
  if (value == null || comparison == null || comparison === 0) return null;
  return (value / comparison - 1) * 100;
}

function periodValue(
  value: number | null,
  source: "actual" | "estimate",
  comparison: number | null,
): PeriodValue {
  if (value == null) return EMPTY;
  return { value, source, change: percentChange(value, comparison) };
}

function estimatedValue(
  type: EstimateType,
  input: number | null | undefined,
  comparison: number | null,
): PeriodValue {
  if (input == null) return EMPTY;
  if (type === "absolute") return periodValue(input, "estimate", comparison);
  if (comparison == null) return EMPTY;
  return periodValue(comparison * (1 + input / 100), "estimate", comparison);
}

// Sum of the seasons, or empty if any of them is.
function summedValue(seasons: PeriodValue[], comparison: number | null): PeriodValue {
  if (seasons.length === 0 || seasons.some((season) => season.value == null)) return EMPTY;
  const total = seasons.reduce((sum, season) => sum + season.value!, 0);
  const source = seasons.every((season) => season.source === "actual") ? "actual" : "estimate";
  return periodValue(total, source, comparison);
}

function periodKey(fieldId: number, periodId: number) {
  return `${fieldId}:${periodId}`;
}

// Actual and predicted values of every field for the given consecutive financial years (oldest
// first). A season with data uses actual values; otherwise each field is predicted from its
// estimate: an absolute estimate is the value, a relative one changes the same period a year
// earlier (actual or predicted) by the percent. Without an estimate or a value to compare with, the
// period is empty. The first year has nothing to compare with.
export function predictCompany({
  years,
  fields,
  actuals,
  estimates,
}: {
  years: EstimateYear[];
  fields: EstimateField[];
  actuals: ActualValues;
  estimates: EstimateInput[];
}): CompanyPrediction {
  const withData = seasonsWithData(actuals);
  const quarterlyInputs = new Map<string, number | null>();
  const yearlyInputs = new Map<string, number | null>();
  for (const estimate of estimates) {
    if (estimate.reportingSeasonId != null)
      quarterlyInputs.set(periodKey(estimate.resultFieldId, estimate.reportingSeasonId), estimate.value);
    else if (estimate.financialYearId != null)
      yearlyInputs.set(periodKey(estimate.resultFieldId, estimate.financialYearId), estimate.value);
  }

  const prediction: CompanyPrediction = { quarterly: {}, yearly: {} };
  for (const field of fields) {
    const quarterly: Record<number, PeriodValue> = {};
    const yearly: Record<number, PeriodValue> = {};

    years.forEach((year, yearIndex) => {
      const previousYear = years[yearIndex - 1];

      year.seasons.forEach((season, index) => {
        const comparisonId = comparisonSeason(previousYear, year, index)?.id;
        const comparison = comparisonId == null ? null : quarterly[comparisonId].value;
        if (withData.has(season.id)) {
          const actual = actuals[field.id]?.[season.id];
          quarterly[season.id] = periodValue(actual == null ? null : Number(actual), "actual", comparison);
        } else {
          const input = quarterlyInputs.get(periodKey(field.id, season.id));
          quarterly[season.id] = estimatedValue(field.estimateType, input, comparison);
        }
      });

      const comparison = previousYear ? yearly[previousYear.id].value : null;
      yearly[year.id] = year.fromSeasons
        ? summedValue(year.seasons.map((season) => quarterly[season.id]), comparison)
        : estimatedValue(field.estimateType, yearlyInputs.get(periodKey(field.id, year.id)), comparison);
    });

    prediction.quarterly[field.id] = quarterly;
    prediction.yearly[field.id] = yearly;
  }
  return prediction;
}
