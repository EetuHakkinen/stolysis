import "server-only";
import type { Unit, ValueFormat } from "@/app/generated/prisma/client";
import {
  actualValues,
  estimatesAsOf,
  estimateYears,
  loadEstimateFields,
  loadEstimateRows,
  loadFinancialYears,
  loadMultiples,
  loadMultipleValueRows,
  loadResultGroups,
  loadScenarios,
  multipleValuesAsOf,
  resultGroupsAsOf,
} from "@/lib/company-data";
import { predictCompany, type PeriodValue } from "@/lib/estimates";
import { endOfNoteDay } from "@/lib/note-date";

// Years shown after the financial year covering the note's date.
const YEARS_AFTER = 2;

export type NoteSnapshotScenario = {
  // Null when no scenario had estimates or multiple values: the values are then the actual ones.
  id: number | null;
  name: string | null;
  // Yearly values of the starred fields by field id, then by financial year id.
  values: Record<number, Record<number, PeriodValue>>;
  // Multiple values by multiple id.
  multiples: Record<number, number | null>;
};

// The company's starred fields and multiples as they were at the end of a note's date: values are
// predicted from the results and estimates saved by then, in each scenario that had estimates or
// multiple values then. Fields and multiples themselves aren't versioned, so they are current.
export type NoteSnapshot = {
  // The financial year covering the date and the YEARS_AFTER years after it; empty if no year
  // covers it.
  years: { id: number; name: string | null; unit: Unit }[];
  fields: { id: number; name: string | null; valueFormat: ValueFormat }[];
  multiples: { id: number; name: string }[];
  // At least one.
  scenarios: NoteSnapshotScenario[];
};

// Everything a company's snapshots are calculated from, loaded once for any number of dates.
export async function loadSnapshotData(companyId: number) {
  const [groups, scenarios, { fields, valueFormats }, estimateRows, years, multiples, multipleValueRows] =
    await Promise.all([
      loadResultGroups(companyId),
      loadScenarios(companyId),
      loadEstimateFields(companyId),
      loadEstimateRows(companyId),
      loadFinancialYears(companyId),
      loadMultiples(companyId),
      loadMultipleValueRows(companyId),
    ]);
  return { groups, scenarios, fields, valueFormats, estimateRows, years, multiples, multipleValueRows };
}

export type SnapshotData = Awaited<ReturnType<typeof loadSnapshotData>>;

// The snapshot at the end of the given note date (see NoteSnapshot).
export function noteSnapshot(data: SnapshotData, date: string): NoteSnapshot {
  const asOf = endOfNoteDay(date);
  const groups = resultGroupsAsOf(data.groups, asOf);
  const actuals = actualValues(groups);
  const starred = groups.flatMap((group) =>
    group.fields
      .filter((field) => field.starred)
      .map(({ id, name, valueFormat }) => ({ id, name, valueFormat })),
  );

  const { years, currentIndex } = estimateYears(data.years, asOf);
  const shown = currentIndex < 0 ? [] : years.slice(currentIndex, currentIndex + YEARS_AFTER + 1);

  const estimates = estimatesAsOf({
    rows: data.estimateRows,
    fields: data.fields,
    valueFormats: data.valueFormats,
    scenarioIds: data.scenarios.map((scenario) => scenario.id),
    asOf,
  });
  const multipleValues = multipleValuesAsOf(data.multipleValueRows, asOf);

  function scenario(id: number | null, name: string | null): NoteSnapshotScenario {
    const prediction = predictCompany({
      years,
      fields: data.fields,
      actuals,
      estimates: id == null ? [] : estimates[id],
    });
    const values = Object.fromEntries(
      starred.map((field) => [
        field.id,
        Object.fromEntries(shown.map((year) => [year.id, prediction.yearly[field.id]?.[year.id]])),
      ]),
    );
    return { id, name, values, multiples: id == null ? {} : (multipleValues[id] ?? {}) };
  }

  const withData = data.scenarios.filter(
    (scenario) =>
      estimates[scenario.id].some((estimate) => estimate.value != null) ||
      Object.values(multipleValues[scenario.id] ?? {}).some((value) => value != null),
  );

  return {
    years: shown.map((year) => ({ id: year.id, name: year.name, unit: year.unit ?? "one" })),
    fields: starred,
    multiples: data.multiples.map(({ id, name }) => ({ id, name })),
    scenarios:
      withData.length > 0
        ? withData.map((item) => scenario(item.id, item.name))
        : [scenario(null, null)],
  };
}
