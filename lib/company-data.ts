import "server-only";
import type { Unit, ValueFormat } from "@/app/generated/prisma/client";
import { ResultFieldType } from "@/app/generated/prisma/enums";
import {
  fromStoredEstimate,
  type ActualValues,
  type EstimateField,
  type EstimateInput,
  type EstimateYear,
  type YearlyActualValues,
} from "@/lib/estimates";
import { fieldFormulas } from "@/lib/formulas";
import { latestRows, rowsAsOf } from "@/lib/latest-rows";
import { prisma } from "@/lib/prisma";
import { fromStoredMultiple } from "@/lib/valuation";

// Loading of a company's results, estimates and multiple values, either current ones or as they
// were at a given time (asOf): insert-only rows created after it are ignored. Loaded rows can be
// reused for several times, e.g. one per note.

// Years estimated after the current financial year.
export const YEARS_AHEAD = 10;
// Years after the current one whose totals are sums of their seasons; later ones are estimated
// as a whole.
const QUARTERLY_YEARS_AHEAD = 1;

export type ResultGroup = {
  id: number;
  name: string | null;
  fields: {
    id: number;
    name: string | null;
    valueFormat: ValueFormat;
    starred: boolean;
    // Calculated from other fields' actual values, so results can't be saved for it.
    calculated: boolean;
    // Reported only for whole financial years: results are saved for years instead of seasons.
    yearlyOnly: boolean;
    // Value in whole euros by reporting season id; seasons without a value are missing. Empty for
    // fields reported only yearly, and for fields calculated from actual values: their values are
    // calculated with the estimates.
    values: Record<number, bigint | null>;
    // Value in whole euros by financial year id, like values. Only fields reported only yearly
    // have them.
    yearlyValues: Record<number, bigint | null>;
  }[];
};

// A company's result field groups and fields in order, with all their result rows.
export function loadResultGroups(companyId: number) {
  return prisma.resultFieldGroup.findMany({
    where: { companyId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      resultFields: {
        orderBy: [{ order: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          valueFormat: true,
          yearlyValue: true,
          starred: true,
          // Rows saved before the field became calculated are ignored.
          fieldDefinitions: { where: { kind: "actual" }, select: { id: true } },
          // result_row is insert-only: newest first, so the first row per period is current.
          resultRows: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { reportingSeasonId: true, financialYearId: true, value: true, createdAt: true },
          },
        },
      },
    },
  });
}

export type LoadedResultGroups = Awaited<ReturnType<typeof loadResultGroups>>;

// The groups with each field's latest value per period at asOf. Rows of the other kind of period
// than the field's are ignored, e.g. seasonal rows saved before the field became reported only
// yearly.
export function resultGroupsAsOf(groups: LoadedResultGroups, asOf?: Date): ResultGroup[] {
  return groups.map(({ resultFields, ...group }) => ({
    ...group,
    fields: resultFields.map(({ resultRows, fieldDefinitions, yearlyValue, ...field }) => {
      const calculated = fieldDefinitions.length > 0;
      const yearlyOnly = yearlyValue === "yearly_only";
      const rows = calculated ? [] : rowsAsOf(resultRows, asOf);
      return {
        ...field,
        calculated,
        yearlyOnly,
        values: yearlyOnly ? {} : latestValues(rows, (row) => row.reportingSeasonId),
        yearlyValues: yearlyOnly ? latestValues(rows, (row) => row.financialYearId) : {},
      };
    }),
  }));
}

// Actual values of the groups' fields by field id.
export function actualValues(groups: ResultGroup[]): ActualValues {
  return Object.fromEntries(groups.flatMap((group) => group.fields.map((field) => [field.id, field.values])));
}

// Actual values of the groups' fields reported only yearly by field id.
export function yearlyActualValues(groups: ResultGroup[]): YearlyActualValues {
  return Object.fromEntries(
    groups.flatMap((group) =>
      group.fields.filter((field) => field.yearlyOnly).map((field) => [field.id, field.yearlyValues]),
    ),
  );
}

// Value of the first (latest) row per period, of rows that have the period.
function latestValues<Row extends { value: bigint | null }>(rows: Row[], periodId: (row: Row) => number | null) {
  const withPeriod = rows.filter((row) => periodId(row) != null);
  return Object.fromEntries(
    latestRows(withPeriod, (row) => periodId(row)!).map((row) => [periodId(row)!, row.value]),
  ) as Record<number, bigint | null>;
}

// A company's estimate scenarios, oldest first.
export function loadScenarios(companyId: number) {
  return prisma.estimateScenario.findMany({
    where: { companyId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
}

// A company's result fields for predicting their values, with their value formats.
export async function loadEstimateFields(
  companyId: number,
): Promise<{ fields: EstimateField[]; valueFormats: Map<number, ValueFormat> }> {
  const rows = await prisma.resultField.findMany({
    where: { resultFieldGroup: { companyId } },
    select: {
      id: true,
      estimateType: true,
      yearlyValue: true,
      valueFormat: true,
      fieldDefinitions: { select: { kind: true, definition: true } },
    },
  });
  return {
    fields: rows.map(({ id, estimateType, yearlyValue, fieldDefinitions }) => ({
      id,
      estimateType,
      yearlyValue,
      ...fieldFormulas(fieldDefinitions),
    })),
    valueFormats: new Map(rows.map((field) => [field.id, field.valueFormat])),
  };
}

// All estimate rows of a company's scenarios.
export function loadEstimateRows(companyId: number) {
  return prisma.estimateRow.findMany({
    where: { estimateScenario: { companyId } },
    // estimate_row is insert-only: newest first, so the first row per period is current.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      estimateScenarioId: true,
      resultFieldId: true,
      reportingSeasonId: true,
      financialYearId: true,
      type: true,
      value: true,
      createdAt: true,
    },
  });
}

export type LoadedEstimateRows = Awaited<ReturnType<typeof loadEstimateRows>>;

// Latest estimates per period at asOf, of the field's estimate type, by scenario id. Every given
// scenario has an entry.
export function estimatesAsOf({
  rows,
  fields,
  valueFormats,
  scenarioIds,
  asOf,
}: {
  rows: LoadedEstimateRows;
  fields: EstimateField[];
  valueFormats: Map<number, ValueFormat>;
  scenarioIds: number[];
  asOf?: Date;
}): Record<number, EstimateInput[]> {
  // Fields calculated from estimates have no estimates of their own; rows saved before the field
  // became calculated are ignored.
  const fieldTypes = new Map(
    fields.filter((field) => !field.estimateDefinition).map((field) => [field.id, field.estimateType]),
  );
  const current = latestRows(
    rowsAsOf(rows, asOf).filter((row) => row.type === fieldTypes.get(row.resultFieldId)),
    (row) =>
      `${row.estimateScenarioId}:${row.resultFieldId}:${row.reportingSeasonId ?? ""}:${row.financialYearId ?? ""}`,
  );
  const estimates: Record<number, EstimateInput[]> = Object.fromEntries(scenarioIds.map((id) => [id, []]));
  for (const row of current) {
    estimates[row.estimateScenarioId]?.push({
      resultFieldId: row.resultFieldId,
      reportingSeasonId: row.reportingSeasonId,
      financialYearId: row.financialYearId,
      value: row.value == null ? null : fromStoredEstimate(row.type, valueFormats.get(row.resultFieldId)!, row.value),
    });
  }
  return estimates;
}

// A company's financial years with a start and an end, oldest first.
export function loadFinancialYears(companyId: number) {
  return prisma.financialYear.findMany({
    where: { companyId, startTime: { not: null }, endTime: { not: null } },
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      unit: true,
      startTime: true,
      endTime: true,
      reportingSeasons: {
        orderBy: [{ startTime: "asc" }, { id: "asc" }],
        select: { id: true, name: true },
      },
    },
  });
}

export type LoadedFinancialYears = Awaited<ReturnType<typeof loadFinancialYears>>;

// The financial years up to YEARS_AHEAD after the one covering the given time, with the position
// of that year (-1 if no year covers it) and the number of years after it.
export function estimateYears(
  all: LoadedFinancialYears,
  at: Date,
): { years: EstimateYear[]; currentIndex: number; after: number } {
  const currentIndex = all.findIndex((year) => year.startTime! <= at && at <= year.endTime!);
  const last = currentIndex < 0 ? all.length : currentIndex + YEARS_AHEAD + 1;
  const years = all.slice(0, last).map((year, index) => ({
    id: year.id,
    name: year.name,
    unit: year.unit as Unit | null,
    endTime: year.endTime!,
    seasons: year.reportingSeasons,
    fromSeasons: currentIndex < 0 || index <= currentIndex + QUARTERLY_YEARS_AHEAD,
  }));
  return { years, currentIndex, after: currentIndex < 0 ? 0 : all.length - currentIndex - 1 };
}

// Ids of the company's fields by special type; null if the company doesn't have one.
export async function loadTypedFieldIds(companyId: number): Promise<Record<ResultFieldType, number | null>> {
  const fields = await prisma.resultField.findMany({
    where: { resultFieldGroup: { companyId }, type: { not: null } },
    orderBy: { id: "asc" },
    select: { id: true, type: true },
  });
  return Object.fromEntries(
    Object.values(ResultFieldType).map((type) => [type, fields.find((field) => field.type === type)?.id ?? null]),
  ) as Record<ResultFieldType, number | null>;
}

// A company's valuation multiples in order.
export function loadMultiples(companyId: number) {
  return prisma.valuationMultiple.findMany({
    where: { companyId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: { id: true, name: true, resultFieldId: true, basis: true },
  });
}

// All values of a company's valuation multiples.
export function loadMultipleValueRows(companyId: number) {
  return prisma.valuationMultipleValue.findMany({
    where: { valuationMultiple: { companyId } },
    // valuation_multiple_value is insert-only: newest first, so the first row per key is current.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { estimateScenarioId: true, valuationMultipleId: true, value: true, createdAt: true },
  });
}

export type LoadedMultipleValueRows = Awaited<ReturnType<typeof loadMultipleValueRows>>;

// Latest multiple values at asOf by scenario id, then by multiple id.
export function multipleValuesAsOf(
  rows: LoadedMultipleValueRows,
  asOf?: Date,
): Record<number, Record<number, number | null>> {
  const values: Record<number, Record<number, number | null>> = {};
  const current = latestRows(rowsAsOf(rows, asOf), (row) => `${row.estimateScenarioId}:${row.valuationMultipleId}`);
  for (const row of current) {
    values[row.estimateScenarioId] ??= {};
    values[row.estimateScenarioId][row.valuationMultipleId] = row.value == null ? null : fromStoredMultiple(row.value);
  }
  return values;
}
