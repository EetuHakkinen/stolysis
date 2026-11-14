"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { toLocalDate } from "@/lib/note-date";
import {
  PRICE_FORMAT,
  PRICE_RANGES,
  pricesInRange,
  withNews,
  type PriceChartNews,
  type PriceChartPoint,
  type PriceRange,
  type StockPricePoint,
} from "@/lib/stock-price";

// Line graph of the closing prices in the range picked with the buttons above it, all by default.
// Days with company news have a dot, and the tooltip lists their titles.
export function StockPriceChart({ prices, news }: { prices: StockPricePoint[]; news: PriceChartNews[] }) {
  const t = useTranslations("StockPrices");
  const format = useFormatter();
  const [range, setRange] = useState<PriceRange>("all");
  const points = useMemo(() => withNews(prices, news), [prices, news]);

  if (prices.length === 0) return <p className="text-muted-foreground">{t("empty")}</p>;

  const config: ChartConfig = {
    close: { label: t("close"), color: "var(--chart-1)" },
    news: { label: t("news"), color: "var(--chart-1)" },
  };
  const data = pricesInRange(points, range);
  // Short ranges are labeled by day, longer ones by month.
  const tickFormat =
    range === "1M" || range === "3M"
      ? ({ day: "numeric", month: "short" } as const)
      : ({ month: "short", year: "2-digit" } as const);

  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <div className="flex justify-end gap-1" role="group" aria-label={t("range")}>
        {PRICE_RANGES.map((item) => (
          <Button
            key={item}
            variant={item === range ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={item === range}
            onClick={() => setRange(item)}
          >
            {t(`ranges.${item}`)}
          </Button>
        ))}
      </div>
      <ChartContainer config={config} className="aspect-auto h-72 w-full">
        <LineChart data={data} margin={{ top: 8, left: 0, right: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={32}
            tickFormatter={(date: string) => format.dateTime(toLocalDate(date), tickFormat)}
          />
          <YAxis
            domain={["auto", "auto"]}
            tickLine={false}
            axisLine={false}
            width="auto"
            tickFormatter={(value: number) => format.number(value, { maximumFractionDigits: 2 })}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const date = payload[0]?.payload?.date;
                  return date ? format.dateTime(toLocalDate(date), { dateStyle: "medium" }) : null;
                }}
                formatter={(value, _, item) => {
                  const { news } = item.payload as PriceChartPoint;
                  return (
                    <div className="flex w-full flex-col gap-1.5">
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">{t("close")}</span>
                        <span className="font-mono font-medium text-foreground tabular-nums">
                          {typeof value === "number" ? format.number(value, PRICE_FORMAT) : "–"}
                        </span>
                      </div>
                      {news.length > 0 && (
                        <ul className="flex max-w-64 flex-col gap-1 border-t pt-1.5">
                          {news.map((item) => (
                            <li key={item.id} className="flex items-start gap-1.5">
                              <span className="mt-1 size-3 shrink-0 rounded-full border-3 border-(--color-news) bg-white" />
                              <span className="text-foreground">{item.title}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                }}
              />
            }
          />
          <Line
            dataKey="close"
            type="linear"
            stroke="var(--color-close)"
            strokeWidth={2}
            dot={NewsDot}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ChartContainer>
    </figure>
  );
}

// A dot on the line for a day with news, nothing for other days.
function NewsDot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: PriceChartPoint }) {
  if (cx == null || cy == null || !payload?.news.length) return null;
  return (
    <circle
      key={payload.date}
      cx={cx}
      cy={cy}
      r={5}
      fill="white"
      stroke="var(--color-news)"
      strokeWidth={3}
    />
  );
}
