"use client";

import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { useFormatter, useTranslations } from "next-intl";
import type { GraphAxis, GraphFieldType, Unit, ValueFormat } from "@/app/generated/prisma/client";
import type { ResultColumn } from "@/components/result-table";
import { SectionTitle } from "@/components/section-title";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { EstimatePeriod } from "@/components/estimate-table";
import type { PeriodValue } from "@/lib/estimates";
import { UNIT_DIVISORS } from "@/lib/units";

// Categorical series colors (see --chart-* in globals.css), assigned in field order.
const SERIES_COLORS = 8;

export type ResultGraphField = {
  resultFieldId: number;
  name: string;
  type: GraphFieldType;
  axis: GraphAxis;
  valueFormat: ValueFormat;
};

// One graph: its fields as lines or bars against the left or right y-axis, with the columns'
// periods on the x-axis. Money values are shown in the unit of the latest period, percent values as
// they are. The right axis is shown only when a field uses it.
export function ResultGraph({
  name,
  fields,
  columns,
  values,
}: {
  name: string;
  fields: ResultGraphField[];
  columns: ResultColumn[];
  values: (fieldId: number, period: EstimatePeriod) => PeriodValue | undefined;
}) {
  const t = useTranslations("Results");
  const format = useFormatter();
  const unit: Unit = columns.at(-1)?.unit ?? "one";

  const key = (field: ResultGraphField) => `field-${field.resultFieldId}`;
  const config: ChartConfig = Object.fromEntries(
    fields.map((field, index) => [
      key(field),
      { label: field.name, color: `var(--chart-${(index % SERIES_COLORS) + 1})` },
    ]),
  );
  const data = columns.map((column) => ({
    label: column.label,
    ...Object.fromEntries(
      fields.map((field) => {
        const value = values(field.resultFieldId, column.period)?.value;
        const shown = value == null ? null : field.valueFormat === "money" ? value / UNIT_DIVISORS[unit] : value;
        return [key(field), shown];
      }),
    ),
  }));

  const formatValue = (value: number) => format.number(value, { maximumFractionDigits: 1 });
  const formatPerShare = (value: number) => format.number(value, { maximumFractionDigits: 2 });
  const suffix = (valueFormat: ValueFormat | undefined) =>
    valueFormat === "percent" ? "%" : valueFormat === "per_share" ? "€" : t(`units.${unit}`);
  // An axis is labeled with % or € when it shows only percent or only per-share fields, otherwise
  // with the unit.
  const axisFormat = (axis: GraphAxis) => {
    const formats = new Set(fields.filter((field) => field.axis === axis).map((field) => field.valueFormat));
    return formats.size === 1 ? [...formats][0] : "money";
  };
  const axisLabel = (axis: GraphAxis) => suffix(axisFormat(axis));
  const tickFormatter = (axis: GraphAxis) => (axisFormat(axis) === "per_share" ? formatPerShare : formatValue);
  const usesRight = fields.some((field) => field.axis === "right");
  const fieldsByKey = new Map(fields.map((field) => [key(field), field]));

  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <SectionTitle as="figcaption">{name}</SectionTitle>
      <ChartContainer config={config} className="aspect-auto h-72 w-full">
        <ComposedChart data={data} margin={{ top: 8, left: 0, right: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
          <YAxis
            yAxisId="left"
            tickLine={false}
            axisLine={false}
            width="auto"
            tickFormatter={tickFormatter("left")}
            label={{ value: axisLabel("left"), angle: -90, position: "insideLeft", className: "fill-muted-foreground" }}
          />
          {usesRight && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={false}
              width="auto"
              tickFormatter={tickFormatter("right")}
              label={{
                value: axisLabel("right"),
                angle: 90,
                position: "insideRight",
                className: "fill-muted-foreground",
              }}
            />
          )}
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, itemKey, item) => {
                  const field = fieldsByKey.get(String(itemKey));
                  return (
                    <div className="flex w-full items-center gap-2">
                      <div className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
                      <span className="flex-1 text-muted-foreground">{field?.name}</span>
                      <span className="font-mono font-medium text-foreground tabular-nums">
                        {typeof value === "number"
                          ? `${(field?.valueFormat === "per_share" ? formatPerShare : formatValue)(value)} ${suffix(field?.valueFormat)}`
                          : "–"}
                      </span>
                    </div>
                  );
                }}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {/* Bars first, so lines are drawn over them. */}
          {[...fields.filter((field) => field.type === "bar"), ...fields.filter((field) => field.type === "line")].map((field) =>
            field.type === "bar" ? (
              <Bar
                key={key(field)}
                dataKey={key(field)}
                yAxisId={field.axis}
                fill={`var(--color-${key(field)})`}
                radius={4}
                maxBarSize={32}
              />
            ) : (
              <Line
                key={key(field)}
                dataKey={key(field)}
                yAxisId={field.axis}
                type="linear"
                stroke={`var(--color-${key(field)})`}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ),
          )}
        </ComposedChart>
      </ChartContainer>
    </figure>
  );
}
