import "server-only";
import { seasonMonths, type ReportingCycle } from "@/lib/financial-year";
import { fetchAnnouncements, fetchIssuers, fetchReleaseText, type NasdaqAnnouncement } from "@/lib/nasdaq";
import { matchIssuer, withoutTranslations } from "@/lib/nasdaq-news";
import { categorizeNews } from "@/lib/news";
import { findReleaseLine } from "@/lib/news-email";
import { INTERIM_CATEGORY, readReportFigures, STATEMENTS_CATEGORY } from "@/lib/report-extraction";
import type { CheckedReport, RevenueBreakdown } from "@/lib/report-check-api";

// Checking which result fields of a company being created can be found in its latest reports on
// Nasdaq, before the company exists: nothing is saved.

// How far back the latest reports are looked for: a financial statements release comes out yearly.
const LOOKBACK_MONTHS = 18;
// Announcements categorized at most, newest first, to find the latest reports.
const MAX_ANNOUNCEMENTS = 60;
// Release pages fetched at the same time.
const TEXT_CONCURRENCY = 3;
// A day's margin for finding a report again by its publish time.
const DAY_MS = 24 * 60 * 60 * 1000;

const SEASON_COUNTS: Record<ReportingCycle, number> = { quarterly: 4, halfYearly: 2, yearly: 1 };

// interim: an interim or half-year report. statements: a financial statements release.
export type ReportKind = CheckedReport["kind"];

export type LatestReport = { id: number; kind: ReportKind; title: string; publishedAt: Date; url: string };

// The issuer's name on Nasdaq: the given one, or the one matching the company's name; undefined
// when none does.
export async function companyIssuer(name: string, nasdaqName: string | null): Promise<string | undefined> {
  return nasdaqName || matchIssuer(name, await fetchIssuers());
}

// The issuer's latest financial statements release and, unless the company reports only yearly,
// its latest interim report from the past 18 months, newest first; either is left out when not
// found. Announcements are categorized like news by their headline and release line.
export async function findLatestReports(issuer: string, cycle: ReportingCycle): Promise<LatestReport[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - LOOKBACK_MONTHS);
  const announcements = withoutTranslations(await fetchAnnouncements({ issuer, language: "fi", since }))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, MAX_ANNOUNCEMENTS);
  const wanted: ReportKind[] = cycle === "yearly" ? ["statements"] : ["statements", "interim"];

  const found = new Map<ReportKind, LatestReport>();
  for (let i = 0; i < announcements.length && found.size < wanted.length; i += TEXT_CONCURRENCY) {
    const batch = announcements.slice(i, i + TEXT_CONCURRENCY);
    const kinds = await Promise.all(batch.map(reportKind));
    for (const [j, kind] of kinds.entries()) {
      if (!kind || !wanted.includes(kind) || found.has(kind)) continue;
      const announcement = batch[j];
      found.set(kind, {
        id: announcement.id,
        kind,
        title: announcement.headline,
        publishedAt: announcement.publishedAt,
        url: announcement.messageUrl,
      });
    }
  }
  return [...found.values()].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}

async function reportKind(announcement: NasdaqAnnouncement): Promise<ReportKind | undefined> {
  const text = await fetchReleaseText(announcement.messageUrl);
  const category = await categorizeNews({ subject: announcement.headline, releaseLine: findReleaseLine(text) });
  if (category.name === STATEMENTS_CATEGORY) return "statements";
  if (category.name === INTERIM_CATEGORY) return "interim";
  return undefined;
}

// Which fields aren't printed in the report, read with AI as results are: fields for the report's
// latest season as long as the company's, and in a financial statements release, fields reported
// only yearly for the whole financial year. An interim report has no yearly figures, so fields
// reported only yearly aren't checked in it. Revenue breakdowns are read from the report a company
// publishes every season: an interim report, or for a company reporting only yearly, a financial
// statements release. Undefined when the report isn't found again or has no PDF.
export async function checkReport({
  issuer,
  report,
  cycle,
  fields,
}: {
  issuer: string;
  report: { id: number; kind: ReportKind; publishedAt: Date };
  cycle: ReportingCycle;
  // Names as shown to the AI, e.g. "Tuloslaskelma: Liikevaihto".
  fields: { id: number; name: string; yearlyOnly: boolean }[];
}): Promise<{ missingFieldIds: number[]; revenueBreakdowns: RevenueBreakdown[] } | undefined> {
  // The report's attachments, found again by its id rather than taken from the client.
  const since = new Date(report.publishedAt.getTime() - DAY_MS);
  const announcement = (await fetchAnnouncements({ issuer, language: "fi", since })).find(
    (candidate) => candidate.id === report.id,
  );
  if (!announcement) return undefined;

  const periodFields = fields.filter((field) => !field.yearlyOnly);
  const yearlyFields = report.kind === "statements" ? fields.filter((field) => field.yearlyOnly) : [];
  // The report schema needs a field to read.
  if (periodFields.length === 0 && yearlyFields.length === 0) return { missingFieldIds: [], revenueBreakdowns: [] };
  const figures = await readReportFigures({
    attachments: announcement.attachments,
    months: seasonMonths(SEASON_COUNTS[cycle])!,
    periodFields,
    yearlyFields: yearlyFields.length > 0 ? yearlyFields : undefined,
    revenueBreakdowns: report.kind === (cycle === "yearly" ? "statements" : "interim"),
  });
  if (!figures) return undefined;
  return {
    missingFieldIds: [
      ...periodFields.filter((field) => !figures.values.current.has(field.id)),
      ...yearlyFields.filter((field) => !figures.values.yearly.has(field.id)),
    ].map((field) => field.id),
    revenueBreakdowns: figures.revenueBreakdowns,
  };
}
