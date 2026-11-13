"use client";

import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts";
import { useFormatter, useTranslations } from "next-intl";
import type { Unit } from "@/app/generated/prisma/client";
import { SectionTitle } from "@/components/section-title";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { dcfValueParts, type DcfResult } from "@/lib/dcf";
import type { EstimateYear } from "@/lib/estimates";
import { UNIT_DIVISORS } from "@/lib/units";

// How the DCF value is divided between the first and the second half of the discounted years and
// the terminal value, as horizontal bars of their percent of the enterprise value. The bars are
// named on the axis, so there's no legend; the tooltip shows the discounted value in the unit.
export function DcfValueChart({
  dcf,
  years,
  unit,
  label,
}: {
  dcf: DcfResult;
  years: EstimateYear[];
  unit: Unit;
  // The financial year's name as shown in the tables, e.g. with an e for estimates.
  label: (year: EstimateYear) => string;
}) {
  const t = useTranslations("Dcf");
  const tResults = useTranslations("Results");
  const format = useFormatter();

  const parts = dcfValueParts(dcf);
  const yearsById = new Map(years.map((year) => [year.id, year]));
  const yearLabel = (yearId: number) => {
    const year = yearsById.get(yearId);
    return year ? label(year) : "";
  };
  const data = parts.map((part, index) => ({
    key: `part-${index}`,
    name:
      part.yearIds == null
        ? t("terminal")
        : part.yearIds.length === 1
          ? yearLabel(part.yearIds[0])
          : `${yearLabel(part.yearIds[0])}–${yearLabel(part.yearIds.at(-1)!)}`,
    share: part.share,
    value: part.value,
    fill: `var(--color-part-${index})`,
  }));
  const config: ChartConfig = Object.fromEntries(
    data.map((row, index) => [row.key, { label: row.name, color: `var(--chart-${index + 1})` }]),
  );
  const percent = (value: number) => `${format.number(value, { maximumFractionDigits: 0 })} %`;

  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <SectionTitle as="figcaption">{t("valueDistribution")}</SectionTitle>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noValue")}</p>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-56 w-full">
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 48 }}>
            <XAxis type="number" dataKey="share" hide />
            <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width="auto" />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(_, __, item) => (
                    <div className="flex w-full items-center gap-2">
                      <div className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.payload.fill }} />
                      <span className="flex-1 text-muted-foreground">{item.payload.name}</span>
                      <span className="font-mono font-medium text-foreground tabular-nums">
                        {format.number(item.payload.value / UNIT_DIVISORS[unit], {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}{" "}
                        {tResults(`units.${unit}`)} · {percent(item.payload.share)}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Bar dataKey="share" radius={4} maxBarSize={32}>
              {data.map((row) => (
                <Cell key={row.key} fill={row.fill} />
              ))}
              <LabelList
                dataKey="share"
                position="right"
                className="fill-foreground"
                formatter={(value) => (typeof value === "number" ? percent(value) : "")}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </figure>
  );
}
