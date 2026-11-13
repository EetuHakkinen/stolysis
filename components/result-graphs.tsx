"use client";

import type { GraphData } from "@/actions/graphs";
import type { ValueFormat } from "@/app/generated/prisma/client";
import type { EstimatePeriod } from "@/components/estimate-table";
import { ResultGraph } from "@/components/result-graph";
import type { ResultColumn } from "@/components/result-table";
import type { EstimateYear, PeriodValue } from "@/lib/estimates";
import { cn } from "@/lib/utils";

// Financial years before the current one shown in the estimate graphs.
const HISTORY_YEARS = 3;
// Financial years before the current one and after it shown in the valuation summary.
const SUMMARY_HISTORY_YEARS = 2;
const SUMMARY_FUTURE_YEARS = 5;
// Years after the current one with quarterly estimates (QUARTERLY_YEARS_AHEAD in actions/estimates).
const QUARTERLY_YEARS_AHEAD = 1;

// Whether any value of the period is estimated.
type IsEstimated = (period: EstimatePeriod) => boolean;

// Estimated periods are marked with an "e" after their name.
function label(name: string, estimated: boolean) {
  return estimated ? `${name}e` : name;
}

function historyStart(years: EstimateYear[], currentYearId: number) {
  return Math.max(0, years.findIndex((year) => year.id === currentYearId) - HISTORY_YEARS);
}

// Seasons of the HISTORY_YEARS financial years before the current one, the current one and the
// years after it that have quarterly estimates.
export function quarterlyGraphColumns(
  years: EstimateYear[],
  currentYearId: number,
  isEstimated: IsEstimated,
): ResultColumn[] {
  const current = years.findIndex((year) => year.id === currentYearId);
  return years.slice(historyStart(years, currentYearId), current + QUARTERLY_YEARS_AHEAD + 1).flatMap((year) =>
    year.seasons.map((season) => {
      const period = { reportingSeasonId: season.id, financialYearId: null };
      return {
        key: `season-${season.id}`,
        label: label(`${season.name ?? ""} ${year.name ?? ""}`.trim(), isEstimated(period)),
        unit: year.unit ?? "one",
        period,
      };
    }),
  );
}

// The HISTORY_YEARS financial years before the current one, the current one and every later one.
export function yearlyGraphColumns(
  years: EstimateYear[],
  currentYearId: number,
  isEstimated: IsEstimated,
): ResultColumn[] {
  return yearColumns(years.slice(historyStart(years, currentYearId)), isEstimated);
}

// The SUMMARY_HISTORY_YEARS financial years before the current one, the current one and the
// SUMMARY_FUTURE_YEARS after it.
export function summaryColumns(
  years: EstimateYear[],
  currentYearId: number,
  isEstimated: IsEstimated,
): ResultColumn[] {
  const current = years.findIndex((year) => year.id === currentYearId);
  return yearColumns(
    years.slice(Math.max(0, current - SUMMARY_HISTORY_YEARS), current + SUMMARY_FUTURE_YEARS + 1),
    isEstimated,
  );
}

function yearColumns(years: EstimateYear[], isEstimated: IsEstimated): ResultColumn[] {
  return years.map((year) => {
    const period = { reportingSeasonId: null, financialYearId: year.id };
    return {
      key: `year-${year.id}`,
      label: label(year.name ?? "", isEstimated(period)),
      unit: year.unit ?? "one",
      period,
    };
  });
}

// The company's graphs over the given columns: a single graph takes the full width, more are shown
// two in a row. Nothing is shown without graphs; graphs without fields are left out.
export function ResultGraphs({
  graphs,
  fields,
  columns,
  values,
}: {
  graphs: GraphData[];
  // The company's result fields by id.
  fields: Map<number, { name: string | null; valueFormat: ValueFormat }>;
  columns: ResultColumn[];
  values: (fieldId: number, period: EstimatePeriod) => PeriodValue | undefined;
}) {
  const shown = graphs
    .map((graph) => ({
      ...graph,
      fields: graph.fields.flatMap((field) => {
        const resultField = fields.get(field.resultFieldId);
        return resultField
          ? [{ ...field, name: resultField.name ?? "", valueFormat: resultField.valueFormat }]
          : [];
      }),
    }))
    .filter((graph) => graph.fields.length > 0);
  if (shown.length === 0 || columns.length === 0) return null;

  return (
    <div className={cn("grid grid-cols-1 gap-6", shown.length > 1 && "lg:grid-cols-2")}>
      {shown.map((graph) => (
        <ResultGraph key={graph.id} name={graph.name} fields={graph.fields} columns={columns} values={values} />
      ))}
    </div>
  );
}
