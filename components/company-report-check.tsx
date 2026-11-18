"use client";

import { CheckIcon, LoaderCircleIcon, PlusIcon, XIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { FieldSuggestions } from "@/components/field-suggestions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { breakdownGroup, revenueEstimateGroupId, type CompanyDraftSettings } from "@/lib/company-draft";
import type { SuggestionResult } from "@/lib/company-draft-suggestions";
import {
  reportCheckProgress,
  reportsMissingField,
  revenueBreakdowns,
  type ReportCheck,
} from "@/lib/company-report-check";
import type { RevenueBreakdown } from "@/lib/report-check-api";

// The progress and outcome of checking a company being created against its latest reports: a
// progress bar while it runs, then the reports read (or why there are none), and the revenue
// breakdowns found, each with a button to add it as a group of fields and, once added, to make the
// revenue estimate its sum, and the suggested changes to the fields the reports don't have.
export function CompanyReportCheck({
  check,
  settings,
  onAddBreakdown,
  onUseBreakdown,
  onApplySuggestion,
}: {
  check: ReportCheck;
  settings: CompanyDraftSettings;
  onAddBreakdown: (breakdown: RevenueBreakdown) => void;
  onUseBreakdown: (groupId: number) => void;
  onApplySuggestion: (ids: string[], result: Extract<SuggestionResult, { ok: true }>) => void;
}) {
  const t = useTranslations("ReportCheck");
  const format = useFormatter();
  const { done, total } = reportCheckProgress(check);
  const breakdowns = revenueBreakdowns(check);
  const estimateGroupId = revenueEstimateGroupId(settings);
  const progressLabel = !check.reports
    ? "findingReports"
    : Object.keys(check.results).length < check.reports.length
      ? "readingReports"
      : "suggesting";

  return (
    <section className="flex flex-col gap-4">
      {check.status === "running" && (
        <div role="status" className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
          <LoaderCircleIcon className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
          <Progress value={(done / total) * 100} className="flex-1">
            <ProgressLabel>{t(progressLabel)}</ProgressLabel>
            <span className="ml-auto text-sm text-muted-foreground tabular-nums">{t("count", { done, total })}</span>
          </Progress>
        </div>
      )}
      {check.status === "failed" && <p className="text-sm text-destructive">{t("failed")}</p>}
      {check.status === "done" && !check.issuer && <p className="text-sm text-muted-foreground">{t("noIssuer")}</p>}
      {check.status === "done" && check.issuer && check.reports?.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("noReports")}</p>
      )}
      {check.reports && check.reports.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <p className="text-muted-foreground">{t("checkedAgainst")}</p>
          <ul className="flex flex-col gap-1">
            {check.reports.map((report) => {
              const result = check.results[report.id];
              return (
                <li key={report.id} className="flex flex-wrap items-center gap-2">
                  <a href={report.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                    {report.title}
                  </a>
                  <span className="text-muted-foreground">
                    {format.dateTime(new Date(report.publishedAt), { dateStyle: "medium" })}
                  </span>
                  {result === null && <span className="text-destructive">{t("unreadable")}</span>}
                  {result === undefined && check.status === "running" && (
                    <span className="text-muted-foreground">{t("reading")}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {breakdowns.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border p-4">
          <h3 className="font-semibold">{t("breakdownsTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("breakdownsDescription")}</p>
          <ul className="flex flex-col gap-3">
            {breakdowns.map((breakdown) => {
              const group = breakdownGroup(settings, breakdown);
              return (
                <li key={breakdown.name} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{breakdown.name}</span>
                    <div className="flex flex-wrap gap-1">
                      {breakdown.categories.map((category) => (
                        <Badge key={category} variant="secondary">
                          {category}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {!group ? (
                    <Button variant="outline" size="sm" onClick={() => onAddBreakdown(breakdown)}>
                      <PlusIcon />
                      {t("addBreakdown")}
                    </Button>
                  ) : group.id === estimateGroupId ? (
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <CheckIcon className="size-4" />
                      {t("usedForEstimate")}
                    </span>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => onUseBreakdown(group.id)}>
                      {t("useForEstimate")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {check.suggestions === null && <p className="text-sm text-destructive">{t("suggestionsFailed")}</p>}
      {check.suggestions && check.suggestions.length > 0 && (
        <FieldSuggestions
          suggestions={check.suggestions}
          settings={settings}
          applied={check.applied}
          newFieldIds={check.newFieldIds}
          onApply={onApplySuggestion}
        />
      )}
    </section>
  );
}

// Red X after a field that a report read doesn't have, naming the reports in its tooltip.
export function MissingFromReportsMarker({ check, fieldId }: { check: ReportCheck; fieldId: number }) {
  const t = useTranslations("ReportCheck");
  const reports = reportsMissingField(check, fieldId);
  if (reports.length === 0) return null;
  const label = t("missing", { reports: reports.map((report) => report.title).join(", ") });
  return (
    <span role="img" aria-label={label} title={label}>
      <XIcon className="size-4 text-destructive" aria-hidden />
    </span>
  );
}
