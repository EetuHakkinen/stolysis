"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { getNewsFetch, refreshNews, updateNews, type RefreshNewsResult } from "@/actions/news";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import type { NewsFetchState } from "@/lib/nasdaq-news-fetch";

const POLL_INTERVAL_MS = 2000;

type NewsFetchContextValue = {
  fetch: NewsFetchState | null;
  refresh: () => Promise<RefreshNewsResult>;
};

const NewsFetchContext = createContext<NewsFetchContextValue | null>(null);

// Keeps track of the company's news fetch from Nasdaq for the banner and the refresh button: its
// progress is polled while it runs, and while a fetch started here may still be starting. With
// `autoUpdate`, the news are checked once the page has loaded (see updateNews). The page refreshes
// when a fetch ends, to show the saved news and extracted results.
export function NewsFetchProvider({
  companyId,
  initialFetch,
  autoUpdate,
  children,
}: {
  companyId: number;
  initialFetch: NewsFetchState | null;
  autoUpdate: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [fetch, setFetch] = useState(initialFetch);
  // Fetches started here that haven't returned yet.
  const [starting, setStarting] = useState(0);
  const autoUpdated = useRef(false);
  const wasRunning = useRef(initialFetch?.status === "running");

  const poll = useCallback(async () => {
    const latest = await getNewsFetch({ companyId });
    setFetch(latest);
    const running = latest?.status === "running";
    if (wasRunning.current && !running) router.refresh();
    wasRunning.current = running;
  }, [companyId, router]);

  const track = useCallback(
    async <T,>(action: Promise<T>): Promise<T> => {
      setStarting((count) => count + 1);
      try {
        return await action;
      } finally {
        setStarting((count) => count - 1);
        void poll();
      }
    },
    [poll],
  );

  useEffect(() => {
    // Effects run twice in development.
    if (!autoUpdate || autoUpdated.current) return;
    autoUpdated.current = true;
    void track(updateNews({ companyId }));
  }, [autoUpdate, companyId, track]);

  const active = fetch?.status === "running" || starting > 0;
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [active, poll]);

  const refresh = useCallback(() => track(refreshNews({ companyId })), [companyId, track]);

  return <NewsFetchContext value={{ fetch, refresh }}>{children}</NewsFetchContext>;
}

export function useNewsFetch(): NewsFetchContextValue {
  const context = useContext(NewsFetchContext);
  if (!context) throw new Error("useNewsFetch must be used within NewsFetchProvider");
  return context;
}

// Banner with the progress of the running news fetch: first the news saved, then the reports whose
// results are extracted. Renders nothing when no fetch is running.
export function NewsFetchBanner() {
  const t = useTranslations("News.fetch");
  const { fetch } = useNewsFetch();
  if (fetch?.status !== "running") return null;

  const savingNews = fetch.processedCount < fetch.newsCount;
  const [done, total] = savingNews
    ? [fetch.processedCount, fetch.newsCount]
    : [fetch.extractedCount, fetch.reportCount];

  return (
    <div role="status" className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
      <LoaderCircleIcon className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
      <Progress value={total > 0 ? (done / total) * 100 : 0} className="flex-1">
        <ProgressLabel>{t(savingNews ? "savingNews" : "extractingResults")}</ProgressLabel>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {t("count", { done, total })}
        </span>
      </Progress>
    </div>
  );
}
