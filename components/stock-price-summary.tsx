import { getFormatter } from "next-intl/server";
import { toLocalDate } from "@/lib/note-date";
import { PRICE_FORMAT, type StockPricePoint } from "@/lib/stock-price";
import { cn } from "@/lib/utils";

// The latest closing price, its change from the trading day before and the day it is from.
// Nothing without prices.
export async function StockPriceSummary({
  prices,
}: {
  prices: StockPricePoint[];
}) {
  const format = await getFormatter();
  const latest = prices.at(-1);
  if (!latest) return null;
  const previous = prices.at(-2);
  const change = previous ? latest.close / previous.close - 1 : null;

  return (
    <div className="flex items-baseline gap-3 tabular-nums">
      <span className="text-2xl font-bold">
        {format.number(latest.close, PRICE_FORMAT)}
      </span>
      {change != null && (
        <span
          className={cn(
            "text-sm",
            change > 0 && "text-emerald-600 dark:text-emerald-500",
            change < 0 && "text-destructive",
          )}
        >
          {format.number(change, {
            style: "percent",
            signDisplay: "exceptZero",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      )}
      <time dateTime={latest.date} className="text-sm text-muted-foreground">
        {format.dateTime(toLocalDate(latest.date), { dateStyle: "medium" })}
      </time>
    </div>
  );
}
