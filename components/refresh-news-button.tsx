"use client";

import { useState, useTransition } from "react";
import { RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RefreshNewsResult } from "@/actions/news";
import { useNewsFetch } from "@/components/news-fetch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Button that checks the company's latest news from Nasdaq right away, with how many were found
// next to it. The feed refreshes once news are saved; the progress shows in the news fetch banner.
export function RefreshNewsButton() {
  const t = useTranslations("News.refresh");
  const { fetch, refresh } = useNewsFetch();
  const [result, setResult] = useState<RefreshNewsResult>();
  const [pending, startTransition] = useTransition();

  function onClick() {
    setResult(undefined);
    startTransition(async () => setResult(await refresh()));
  }

  return (
    <div className="flex items-center gap-2">
      {result && !pending && (
        <span
          role="status"
          className={cn("text-sm", "error" in result ? "text-destructive" : "text-muted-foreground")}
        >
          {"error" in result ? t(`errors.${result.error}`) : t("saved", { count: result.savedCount })}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onClick}
        disabled={pending || fetch?.status === "running"}
        aria-label={t("open")}
        title={t("open")}
      >
        <RefreshCwIcon className={cn(pending && "animate-spin")} />
      </Button>
    </div>
  );
}
