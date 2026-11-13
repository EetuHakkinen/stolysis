"use client";

import { useState, useTransition } from "react";
import { RefreshCwIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { refreshStockPrices, type RefreshStockPricesResult } from "@/actions/stock-prices";
import { Button } from "@/components/ui/button";
import { TIME_ZONE } from "@/lib/helsinki-time";
import { cn } from "@/lib/utils";

// Button that fetches the company's latest stock prices, with when they were last fetched or why
// fetching failed next to it.
export function RefreshPricesButton({
  companyId,
  symbol,
  fetchedAt,
}: {
  companyId: number;
  symbol: string;
  fetchedAt: Date | null;
}) {
  const t = useTranslations("StockPrices");
  const format = useFormatter();
  const [error, setError] = useState<RefreshStockPricesResult["error"]>();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      setError((await refreshStockPrices({ companyId })).error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      {pending ? (
        <span className="text-sm text-muted-foreground">{t("refreshing")}</span>
      ) : error ? (
        <span className="text-sm text-destructive">{t(`errors.${error}`, { symbol })}</span>
      ) : (
        <span className="text-sm text-muted-foreground">
          {fetchedAt
            ? t("fetchedAt", {
                time: format.dateTime(fetchedAt, { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE }),
              })
            : t("neverFetched")}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        disabled={pending}
        aria-label={t("refresh")}
        title={t("refresh")}
      >
        <RefreshCwIcon className={cn(pending && "animate-spin")} />
      </Button>
    </div>
  );
}
