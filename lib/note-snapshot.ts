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
  loadResultGroups,
  loadScenarios,
  loadTypedFieldIds,
  resultGroupsAsOf,
  yearlyActualValues,
} from "@/lib/company-data";
import { predictCompany, type PeriodValue } from "@/lib/estimates";
import { endOfNoteDay } from "@/lib/note-date";
import { priceOn, type StockPricePoint } from "@/lib/stock-price";
import { loadStockPrices } from "@/lib/stock-prices";
import { priceMultiples } from "@/lib/valuation";

// Years shown after the financial year covering the note's date.
const YEARS_AFTER = 2;

export type NoteSnapshotScenario = {
  // Null when no scenario had estimates: the values are then the actual ones.
  id: number | null;
  name: string | null;
  // Yearly values of the starred fields by field id, then by financial year id.
  values: Record<number, Record<number, PeriodValue>>;
  // The multiples the stock price gives in each year (see priceMultiples), by multiple id and then
  // by financial year id; empty without a price.
  multiples: Record<number, Record<number, number | null>>;
};

// The company's starred fields and multiples as they were at the end of a note's date: values are
// predicted from the results and estimates saved by then, in each scenario that had estimates then,
// and the multiples are calculated from them at the date's stock price. Fields and multiples
// themselves aren't versioned, so they are current.
export type NoteSnapshot = {
  // The closing price on the date, or on the last trading day before it; null without one.
  stockPrice: StockPricePoint | null;
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
  const [groups, scenarios, { fields, valueFormats }, estimateRows, years, multiples, fieldIds, prices] =
    await Promise.all([
      loadResultGroups(companyId),
      loadScenarios(companyId),
      loadEstimateFields(companyId),
      loadEstimateRows(companyId),
      loadFinancialYears(companyId),
      loadMultiples(companyId),
      loadTypedFieldIds(companyId),
      loadStockPrices(companyId),
    ]);
  return { groups, scenarios, fields, valueFormats, estimateRows, years, multiples, fieldIds, prices };
}

export type SnapshotData = Awaited<ReturnType<typeof loadSnapshotData>>;

// The snapshot at the end of the given note date (see NoteSnapshot).
export function noteSnapshot(data: SnapshotData, date: string): NoteSnapshot {
  const asOf = endOfNoteDay(date);
  const groups = resultGroupsAsOf(data.groups, asOf);
  const actuals = actualValues(groups);
  const yearlyActuals = yearlyActualValues(groups);
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
  const stockPrice = priceOn(data.prices, date);

  function scenario(id: number | null, name: string | null): NoteSnapshotScenario {
    const prediction = predictCompany({
      years,
      fields: data.fields,
      actuals,
      yearlyActuals,
      estimates: id == null ? [] : estimates[id],
    });
    const values = Object.fromEntries(
      starred.map((field) => [
        field.id,
        Object.fromEntries(shown.map((year) => [year.id, prediction.yearly[field.id]?.[year.id]])),
      ]),
    );
    const multiples = stockPrice
      ? priceMultiples({
          multiples: data.multiples,
          prediction,
          yearIds: shown.map((year) => year.id),
          price: stockPrice.close,
          netDebtFieldId: data.fieldIds.net_debt,
          shareCountFieldId: data.fieldIds.share_count,
        })
      : {};
    return { id, name, values, multiples };
  }

  const withData = data.scenarios.filter((scenario) =>
    estimates[scenario.id].some((estimate) => estimate.value != null),
  );

  return {
    stockPrice,
    years: shown.map((year) => ({ id: year.id, name: year.name, unit: year.unit ?? "one" })),
    fields: starred,
    multiples: data.multiples.map(({ id, name }) => ({ id, name })),
    scenarios:
      withData.length > 0
        ? withData.map((item) => scenario(item.id, item.name))
        : [scenario(null, null)],
  };
}
