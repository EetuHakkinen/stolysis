"use client";

import { useFormatter } from "next-intl";
import type { EstimateType, Unit, ValueFormat } from "@/app/generated/prisma/client";
import {
  comparisonSeason,
  roundEstimate,
  type EstimateYear,
  type PeriodValue,
} from "@/lib/estimates";
import { UNIT_DIVISORS } from "@/lib/units";
import { FormattedValue, PeriodTable, type PeriodTableColumn } from "@/components/period-table";
import { SavedNumberInput } from "@/components/saved-number-input";

// The period an estimate column shows: exactly one of the ids is set.
export type EstimatePeriod = { reportingSeasonId: number | null; financialYearId: number | null };

export type EstimateColumn = PeriodTableColumn & {
  period: EstimatePeriod;
  // Comparison periods and years summed from seasons are shown read-only.
  editable: boolean;
};

function yearUnit(year: EstimateYear): Unit {
  return year.unit ?? "one";
}

// Seasons of the current and next financial year that have no data, each with the season it's
// compared with. Seasons with data are shown only as comparison periods.
export function quarterlyEstimateColumns(
  years: EstimateYear[],
  currentYearId: number,
  withData: Set<number>,
): EstimateColumn[] {
  const current = years.findIndex((year) => year.id === currentYearId);
  // Shown seasons: editable or comparison only.
  const shown = new Map<number, boolean>();
  for (const yearIndex of [current, current + 1]) {
    const year = years[yearIndex];
    year?.seasons.forEach((season, index) => {
      if (withData.has(season.id)) return;
      shown.set(season.id, true);
      const comparison = comparisonSeason(years[yearIndex - 1], year, index);
      if (comparison && !shown.has(comparison.id)) shown.set(comparison.id, false);
    });
  }

  return years.slice(Math.max(0, current - 1), current + 2).flatMap((year) =>
    year.seasons
      .filter((season) => shown.has(season.id))
      .map((season) => ({
        key: `season-${season.id}`,
        label: `${season.name ?? ""} ${year.name ?? ""}`.trim(),
        unit: yearUnit(year),
        period: { reportingSeasonId: season.id, financialYearId: null },
        editable: shown.get(season.id)!,
      })),
  );
}

// The previous financial year as the comparison period, the current one and the years after it.
// Years summed from their seasons are read-only.
export function yearlyEstimateColumns(years: EstimateYear[], currentYearId: number): EstimateColumn[] {
  const current = years.findIndex((year) => year.id === currentYearId);
  return years.slice(Math.max(0, current - 1)).map((year) => ({
    key: `year-${year.id}`,
    label: year.name ?? "",
    unit: yearUnit(year),
    period: { reportingSeasonId: null, financialYearId: year.id },
    editable: !year.fromSeasons,
  }));
}

// Fields calculated from estimates have no estimates of their own, so their cells are read-only.
export type EstimateTableField = {
  id: number;
  name: string | null;
  estimateType: EstimateType;
  valueFormat: ValueFormat;
  calculated: boolean;
};

// One result field group's estimates, with result fields as rows and periods as columns. Editable
// cells hold the estimate variable and save it when they lose focus; the predicted value is shown
// beneath. Unlike the result tables, the columns start from the earliest ones: the comparison
// periods and the nearest estimates.
export function EstimateTable({
  name,
  fields,
  columns,
  values,
  input,
  save,
}: {
  name: string | null;
  fields: EstimateTableField[];
  columns: EstimateColumn[];
  // Actual or predicted value of the field for the period.
  values: (fieldId: number, period: EstimatePeriod) => PeriodValue | undefined;
  // Current estimate variable of the field for the period.
  input: (fieldId: number, period: EstimatePeriod) => number | null | undefined;
  save: (fieldId: number, period: EstimatePeriod, value: number | null) => Promise<boolean>;
}) {
  return (
    <PeriodTable
      name={name}
      fields={fields}
      columns={columns}
      cell={(field, column) =>
        column.editable && !field.calculated ? (
          <EstimateCell
            type={field.estimateType}
            unit={column.unit}
            valueFormat={field.valueFormat}
            value={values(field.id, column.period)}
            input={input(field.id, column.period) ?? null}
            save={(value) => save(field.id, column.period, value)}
          />
        ) : (
          <FormattedValue
            value={values(field.id, column.period)?.value}
            unit={column.unit}
            valueFormat={field.valueFormat}
          />
        )
      }
    />
  );
}

// Input for an estimate variable: a percent change for relative estimates, a value in the column's
// unit (as is for percent fields) for absolute ones. Saves on blur when the text has changed, rounded to what can be stored.
// Relative estimates show the predicted value beneath, absolute ones the change it makes.
function EstimateCell({
  type,
  unit,
  valueFormat,
  value,
  input,
  save,
}: {
  type: EstimateType;
  unit: Unit;
  valueFormat: ValueFormat;
  value: PeriodValue | undefined;
  input: number | null;
  save: (value: number | null) => Promise<boolean>;
}) {
  const format = useFormatter();
  const divisor = type === "absolute" && valueFormat === "money" ? UNIT_DIVISORS[unit] : 1;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        {/* Saved as hundredths of a percent or whole euros, so show what's saved. */}
        <SavedNumberInput
          value={input}
          toValue={(typed) => roundEstimate(type, valueFormat, typed * divisor)}
          toNumber={(value) => value / divisor}
          save={save}
        />
        {(type === "relative" || valueFormat === "percent") && (
          <span className="text-xs text-muted-foreground">%</span>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        {type === "relative" ? (
          <FormattedValue value={value?.value} unit={unit} valueFormat={valueFormat} />
        ) : value?.change == null ? (
          "–"
        ) : (
          `${format.number(value.change, { maximumFractionDigits: 1, signDisplay: "exceptZero" })} %`
        )}
      </div>
    </div>
  );
}
