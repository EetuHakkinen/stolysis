// Predicted values of a company's result fields in an estimate scenario. Pure, so it runs on the
// client as well as on the server: predicted values are never saved, only estimate variables are.
// Values are in whole euros as numbers, since relative estimates produce fractions.

import type { EstimateType, Unit, ValueFormat, YearlyValue } from "@/app/generated/prisma/client";
import { evaluateFormula, evaluationOrder, type Formula, type FormulaPeriod } from "./formulas.ts";

export type EstimateSeason = { id: number; name: string | null };

export type EstimateYear = {
  id: number;
  name: string | null;
  unit: Unit | null;
  endTime: Date;
  // Reporting seasons in order.
  seasons: EstimateSeason[];
  // The year's value is formed from its seasons (see YearlyValue); otherwise the year is estimated
  // as a whole.
  fromSeasons: boolean;
};

export type EstimateField = {
  id: number;
  estimateType: EstimateType;
  yearlyValue: YearlyValue;
  // Formulas of a calculated field: actualDefinition for periods with data, estimateDefinition for
  // the others. Null when the values are entered or estimated.
  actualDefinition: Formula | null;
  estimateDefinition: Formula | null;
};

// Current estimate variable of a field for one period (exactly one of the period ids is set):
// relative is a percent change, absolute a value in whole euros. Null clears the estimate.
export type EstimateInput = {
  resultFieldId: number;
  reportingSeasonId: number | null;
  financialYearId: number | null;
  value: number | null;
};

// Actual values in whole euros by result field id and reporting season id. Fields calculated from
// actual values and fields reported only yearly have none.
export type ActualValues = Record<number, Record<number, bigint | null>>;

// Actual values of fields reported only yearly, in whole euros by result field id and financial
// year id. Fields calculated from actual values have none.
export type YearlyActualValues = Record<number, Record<number, bigint | null>>;

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

// Relative estimates and absolute ones of percent fields are stored in hundredths of a percent
// (348 = 3.48 %), other absolute ones in whole euros like result values.
function storedScale(type: EstimateType, valueFormat: ValueFormat): number {
  return type === "relative" || valueFormat === "percent" ? 100 : 1;
}

// Estimate variable rounded to what can be stored: two decimals of a percent or whole euros.
export function roundEstimate(type: EstimateType, valueFormat: ValueFormat, value: number): number {
  const scale = storedScale(type, valueFormat);
  return Math.round(value * scale) / scale;
}

export function toStoredEstimate(type: EstimateType, valueFormat: ValueFormat, value: number): bigint {
  return BigInt(Math.round(value * storedScale(type, valueFormat)));
}

export function fromStoredEstimate(type: EstimateType, valueFormat: ValueFormat, value: bigint): number {
  return Number(value) / storedScale(type, valueFormat);
}

// Periods with any data: at least one field's latest value isn't null.
function periodsWithData(values: Record<number, Record<number, bigint | null>>): Set<number> {
  const periods = new Set<number>();
  for (const fieldValues of Object.values(values)) {
    for (const [periodId, value] of Object.entries(fieldValues)) {
      if (value != null) periods.add(Number(periodId));
    }
  }
  return periods;
}

// Reporting seasons with any data. In those seasons every field uses its actual value, and no
// estimates are needed.
export function seasonsWithData(actuals: ActualValues): Set<number> {
  return periodsWithData(actuals);
}

// Financial years with any data from fields reported only yearly. In those years every such field
// uses its actual value, and no estimates are needed.
export function yearsWithData(yearlyActuals: YearlyActualValues): Set<number> {
  return periodsWithData(yearlyActuals);
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

function actualValue(actual: bigint | null | undefined, comparison: number | null): PeriodValue {
  return periodValue(actual == null ? null : Number(actual), "actual", comparison);
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

// Value of the formula with the values of its fields. The value is actual when all of them are; a
// formula without fields takes the period's source.
function calculatedValue(
  formula: Formula,
  input: (fieldId: number, period: FormulaPeriod) => PeriodValue | undefined,
  periodSource: "actual" | "estimate",
  comparison: number | null,
): PeriodValue {
  let usesFields = false;
  let usesEstimates = false;
  const value = evaluateFormula(formula, (fieldId, period) => {
    const periodValue = input(fieldId, period);
    usesFields = true;
    if (periodValue?.source !== "actual") usesEstimates = true;
    return periodValue?.value ?? null;
  });
  if (value == null) return EMPTY;
  const source = usesFields ? (usesEstimates ? "estimate" : "actual") : periodSource;
  return periodValue(value, source, comparison);
}

// Value of the last season, or empty if it is.
function lastValue(seasons: PeriodValue[], comparison: number | null): PeriodValue {
  const last = seasons.at(-1);
  if (last?.value == null) return EMPTY;
  return periodValue(last.value, last.source!, comparison);
}

function periodKey(fieldId: number, periodId: number) {
  return `${fieldId}:${periodId}`;
}

// Actual and predicted values of every field for the given consecutive financial years (oldest
// first). A season with data uses actual values; otherwise each field is predicted from its
// estimate: an absolute estimate is the value, a relative one changes the same period a year
// earlier (actual or predicted) by the percent. Without an estimate or a value to compare with, the
// period is empty. A year formed from its seasons is their sum, or the last season's value for
// last_period fields. The first year has nothing to compare with.
//
// Fields reported only yearly have no seasonal values. Every year of theirs is like a season: a
// year with data from such fields uses their actual values, other years their yearly estimates.
//
// Calculated fields use their formula instead: the actual one in seasons with data and in years
// formed from their seasons, the estimate one elsewhere. A year's formula is calculated from the
// fields' yearly values, not summed from its seasons, so e.g. a margin is the year's margin. In
// years formed from their seasons, fields calculated only for estimates are summed like entered
// ones, or calculated with the estimate formula when reported only yearly and the year has no data.
// Periods are calculated oldest first, and the fields of a period in an order where a formula's
// fields come before it.
export function predictCompany({
  years,
  fields,
  actuals,
  yearlyActuals,
  estimates,
}: {
  years: EstimateYear[];
  fields: EstimateField[];
  actuals: ActualValues;
  yearlyActuals: YearlyActualValues;
  estimates: EstimateInput[];
}): CompanyPrediction {
  const withData = seasonsWithData(actuals);
  const yearsWithYearlyData = yearsWithData(yearlyActuals);
  const quarterlyInputs = new Map<string, number | null>();
  const yearlyInputs = new Map<string, number | null>();
  for (const estimate of estimates) {
    if (estimate.reportingSeasonId != null)
      quarterlyInputs.set(periodKey(estimate.resultFieldId, estimate.reportingSeasonId), estimate.value);
    else if (estimate.financialYearId != null)
      yearlyInputs.set(periodKey(estimate.resultFieldId, estimate.financialYearId), estimate.value);
  }

  const fieldIds = fields.map((field) => field.id);
  const formulasOf = (key: "actualDefinition" | "estimateDefinition") => {
    const formulas = new Map<number, Formula>();
    for (const field of fields) if (field[key]) formulas.set(field.id, field[key]);
    return { formulas, order: evaluationOrder(fieldIds, formulas) };
  };
  const actualFormulas = formulasOf("actualDefinition");
  const estimateFormulas = formulasOf("estimateDefinition");
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const yearlyOnly = fields.filter((field) => field.yearlyValue === "yearly_only");

  // Formulas of a year formed from its seasons: the actual ones, and the estimate ones of fields
  // reported only yearly when the year has no data for them.
  const seasonYearFormulas = (hasYearlyData: boolean) => {
    if (hasYearlyData || !yearlyOnly.some((field) => !field.actualDefinition && field.estimateDefinition))
      return actualFormulas;
    const formulas = new Map(actualFormulas.formulas);
    for (const field of yearlyOnly)
      if (!field.actualDefinition && field.estimateDefinition) formulas.set(field.id, field.estimateDefinition);
    return { formulas, order: evaluationOrder(fieldIds, formulas) };
  };

  const prediction: CompanyPrediction = { quarterly: {}, yearly: {} };
  for (const field of fields) {
    prediction.quarterly[field.id] = {};
    prediction.yearly[field.id] = {};
  }
  const { quarterly, yearly } = prediction;

  years.forEach((year, yearIndex) => {
    const previousYear = years[yearIndex - 1];

    year.seasons.forEach((season, index) => {
      const comparisonId = comparisonSeason(previousYear, year, index)?.id;
      const hasData = withData.has(season.id);
      const { formulas, order } = hasData ? actualFormulas : estimateFormulas;

      for (const fieldId of order) {
        const field = fieldsById.get(fieldId)!;
        const comparison = comparisonId == null ? null : quarterly[fieldId][comparisonId].value;
        const formula = formulas.get(fieldId);
        if (field.yearlyValue === "yearly_only") {
          quarterly[fieldId][season.id] = EMPTY;
        } else if (formula) {
          const periodId = (period: FormulaPeriod) => (period === "current" ? season.id : comparisonId);
          quarterly[fieldId][season.id] = calculatedValue(
            formula,
            (id, period) => quarterly[id]?.[periodId(period) ?? -1],
            hasData ? "actual" : "estimate",
            comparison,
          );
        } else if (hasData) {
          quarterly[fieldId][season.id] = actualValue(actuals[fieldId]?.[season.id], comparison);
        } else {
          const input = quarterlyInputs.get(periodKey(fieldId, season.id));
          quarterly[fieldId][season.id] = estimatedValue(field.estimateType, input, comparison);
        }
      }
    });

    const hasYearlyData = yearsWithYearlyData.has(year.id);
    const allData =
      year.fromSeasons &&
      year.seasons.length > 0 &&
      year.seasons.every((season) => withData.has(season.id)) &&
      (yearlyOnly.length === 0 || hasYearlyData);
    // A year formed from its seasons has a value for every field from them, so it's calculated as
    // if it had data.
    const { formulas, order } = year.fromSeasons ? seasonYearFormulas(hasYearlyData) : estimateFormulas;
    for (const fieldId of order) {
      const field = fieldsById.get(fieldId)!;
      const comparison = previousYear ? yearly[fieldId][previousYear.id].value : null;
      const formula = formulas.get(fieldId);
      const seasons = year.seasons.map((season) => quarterly[fieldId][season.id]);
      const periodId = (period: FormulaPeriod) => (period === "current" ? year.id : previousYear?.id);
      yearly[fieldId][year.id] = formula
        ? calculatedValue(
            formula,
            (id, period) => yearly[id]?.[periodId(period) ?? -1],
            allData ? "actual" : "estimate",
            comparison,
          )
        : field.yearlyValue === "yearly_only"
          ? hasYearlyData
            ? actualValue(yearlyActuals[fieldId]?.[year.id], comparison)
            : estimatedValue(field.estimateType, yearlyInputs.get(periodKey(fieldId, year.id)), comparison)
          : year.fromSeasons
            ? field.yearlyValue === "last_period"
              ? lastValue(seasons, comparison)
              : summedValue(seasons, comparison)
            : estimatedValue(field.estimateType, yearlyInputs.get(periodKey(fieldId, year.id)), comparison);
    }
  });

  return prediction;
}
