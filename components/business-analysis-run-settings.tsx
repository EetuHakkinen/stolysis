"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SparklesIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import {
  getBusinessAnalysisRun,
  startBusinessAnalysisRun,
  type BusinessAnalysisRunInfo,
} from "@/actions/business-analysis";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { StartBusinessAnalysisRunResult } from "@/lib/business-analysis-run";

const POLL_INTERVAL_MS = 3000;

// Company settings section for going through the company's past interim reports and financial
// statements releases not yet gone through for the business analysis, e.g. news received before the
// analysis existed or whose analysis failed. The latest run's progress is polled while it runs.
export function BusinessAnalysisRunSettings({
  companyId,
  info: initialInfo,
}: {
  companyId: number;
  info: BusinessAnalysisRunInfo;
}) {
  const t = useTranslations("BusinessAnalysisRun");
  const format = useFormatter();
  const router = useRouter();
  const [{ run, pendingCount }, setInfo] = useState(initialInfo);
  const [error, setError] = useState<Extract<StartBusinessAnalysisRunResult, { started: false }>["reason"]>();

  const running = run?.status === "running";

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(async () => {
      const latest = await getBusinessAnalysisRun({ companyId });
      setInfo(latest);
      if (latest.run?.status !== "running") router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [companyId, running, router]);

  async function start() {
    const result = await startBusinessAnalysisRun({ companyId });
    setError(result.started ? undefined : result.reason);
    setInfo(await getBusinessAnalysisRun({ companyId }));
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <ConfirmDialog
          title={t("confirmTitle")}
          description={t("confirmDescription", { count: pendingCount })}
          confirmLabel={t("start")}
          pendingLabel={t("starting")}
          confirm={start}
          trigger={
            <Button variant="outline" size="sm" disabled={pendingCount === 0 || running}>
              <SparklesIcon />
              {t("start")}
            </Button>
          }
        />
      </div>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      {!running && <p className="text-sm">{t("pending", { count: pendingCount })}</p>}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {t(`errors.${error}`)}
        </p>
      )}
      {run && (
        <p className="text-sm" role="status">
          {t(`status.${run.status}`, {
            startedAt: format.dateTime(run.createdAt, { dateStyle: "short", timeStyle: "short" }),
            processed: run.processedCount,
            total: run.newsCount,
          })}
          {run.failedCount > 0 && ` ${t("failedNews", { count: run.failedCount })}`}
        </p>
      )}
    </section>
  );
}
