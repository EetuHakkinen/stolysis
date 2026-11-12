"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { EstimateType, Unit } from "@/app/generated/prisma/client";
import {
  comparisonSeason,
  roundEstimate,
  type EstimateYear,
  type PeriodValue,
} from "@/lib/estimates";
import { UNIT_DIVISORS } from "@/lib/units";
import { FormattedValue, PeriodTable, type PeriodTableColumn } from "@/components/period-table";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

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

export type EstimateTableField = { id: number; name: string | null; estimateType: EstimateType };

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
        column.editable ? (
          <EstimateCell
            type={field.estimateType}
            unit={column.unit}
            value={values(field.id, column.period)}
            input={input(field.id, column.period) ?? null}
            save={(value) => save(field.id, column.period, value)}
          />
        ) : (
          <FormattedValue value={values(field.id, column.period)?.value} unit={column.unit} />
        )
      }
    />
  );
}

// Parses a number typed in either locale ("1 234,5", "-1234.5"). Empty text is null; undefined
// means the text isn't a number.
function parseNumber(text: string): number | null | undefined {
  const normalized = text.replace(/\s/g, "").replace(",", ".").replace("−", "-");
  if (normalized === "") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

// Input for an estimate variable: a percent change for relative estimates, a value in the column's
// unit for absolute ones. Saves on blur when the text has changed, rounded to what can be stored.
// Relative estimates show the predicted value beneath, absolute ones the change it makes.
function EstimateCell({
  type,
  unit,
  value,
  input,
  save,
}: {
  type: EstimateType;
  unit: Unit;
  value: PeriodValue | undefined;
  input: number | null;
  save: (value: number | null) => Promise<boolean>;
}) {
  const t = useTranslations("Estimates");
  const format = useFormatter();
  const divisor = type === "absolute" ? UNIT_DIVISORS[unit] : 1;

  function formatInput(input: number | null) {
    if (input == null) return "";
    return format.number(input / divisor, { maximumFractionDigits: 6, useGrouping: false });
  }

  const [text, setText] = useState(() => formatInput(input));
  const [savedText, setSavedText] = useState(text);
  const [error, setError] = useState<"invalid" | "saveFailed">();
  const [pending, startTransition] = useTransition();

  function blur() {
    if (text === savedText) return setError(undefined);
    const parsed = parseNumber(text);
    if (parsed === undefined) return setError("invalid");

    // Saved as hundredths of a percent or whole euros, so show what's saved.
    const value = parsed == null ? null : roundEstimate(type, parsed * divisor);
    const rounded = formatInput(value);
    setText(rounded);
    startTransition(async () => {
      const saved = await save(value);
      if (!saved) return setError("saveFailed");
      setError(undefined);
      setSavedText(rounded);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={blur}
          inputMode="decimal"
          aria-invalid={!!error}
          title={error && t(`errors.${error}`)}
          className={cn("h-7 w-20 text-right tabular-nums", pending && "opacity-60")}
        />
        {type === "relative" && <span className="text-xs text-muted-foreground">%</span>}
      </div>
      <div className="text-xs text-muted-foreground">
        {type === "relative" ? (
          <FormattedValue value={value?.value} unit={unit} />
        ) : value?.change == null ? (
          "–"
        ) : (
          `${format.number(value.change, { maximumFractionDigits: 1, signDisplay: "exceptZero" })} %`
        )}
      </div>
    </div>
  );
}
