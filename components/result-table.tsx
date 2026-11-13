"use client";

import type { ResultSeason } from "@/actions/results";
import type { Unit, ValueFormat } from "@/app/generated/prisma/client";
import type { EstimatePeriod } from "@/components/estimate-table";
import { FormattedValue, PeriodTable, type PeriodTableColumn } from "@/components/period-table";
import type { PeriodValue } from "@/lib/estimates";

export type ResultColumn = PeriodTableColumn & { period: EstimatePeriod };

// Whether any value of the period is estimated.
type IsEstimated = (period: EstimatePeriod) => boolean;

// Values are stored in whole euros; financial years without a unit are shown in euros.
function seasonUnit(season: ResultSeason): Unit {
  return season.financialYear.unit ?? "one";
}

// Estimated periods are marked with an "e" after their name.
function label(name: string, estimated: boolean) {
  return estimated ? `${name}e` : name;
}

// One column per reporting season.
export function quarterlyResultColumns(seasons: ResultSeason[], isEstimated: IsEstimated): ResultColumn[] {
  return seasons.map((season) => {
    const period = { reportingSeasonId: season.id, financialYearId: null };
    return {
      key: `season-${season.id}`,
      label: label(`${season.name ?? ""} ${season.financialYear.name ?? ""}`.trim(), isEstimated(period)),
      unit: seasonUnit(season),
      period,
    };
  });
}

// One column per financial year. Seasons come oldest first, so the years do too.
export function yearlyResultColumns(seasons: ResultSeason[], isEstimated: IsEstimated): ResultColumn[] {
  const years = new Map<number, ResultColumn>();
  for (const season of seasons) {
    const { id, name } = season.financialYear;
    if (years.has(id)) continue;
    const period = { reportingSeasonId: null, financialYearId: id };
    years.set(id, {
      key: `year-${id}`,
      label: label(name ?? "", isEstimated(period)),
      unit: seasonUnit(season),
      period,
    });
  }
  return [...years.values()];
}

// A result field group's actual values, with the selected scenario's predicted values where
// there's no data yet. Starts from the latest columns.
export function ResultTable({
  name,
  fields,
  columns,
  values,
}: {
  name: string | null;
  fields: { id: number; name: string | null; valueFormat: ValueFormat }[];
  columns: ResultColumn[];
  values: (fieldId: number, period: EstimatePeriod) => PeriodValue | undefined;
}) {
  return (
    <PeriodTable
      name={name}
      fields={fields}
      columns={columns}
      scrollFromEnd
      cell={(field, column) => (
        <FormattedValue
          value={values(field.id, column.period)?.value}
          unit={column.unit}
          valueFormat={field.valueFormat}
        />
      )}
    />
  );
}
