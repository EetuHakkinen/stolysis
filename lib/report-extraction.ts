import "server-only";
import { z } from "zod";
import type { Unit } from "@/app/generated/prisma/client";
import { seasonMonths } from "@/lib/financial-year";
import { structuredCompletion } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import { findOrCreateReportingSeason, parseLocalDate } from "@/lib/reporting-season";

// Categories of news whose PDF attachment is a report with an income statement.
const REPORT_CATEGORIES = ["Osavuosikatsaus", "Tilinpäätöstiedote"];

// Only news in these categories are worth extracting results from.
export function isReportCategory(categoryName: string): boolean {
  return REPORT_CATEGORIES.includes(categoryName);
}

const MAX_PDF_BYTES = 30 * 1024 * 1024;

const UNIT_MULTIPLIERS: Record<Unit, number> = { million: 1_000_000, thousand: 1_000, one: 1 };

// Which period to read, by the length of the company's reporting seasons in months.
const PERIODS: Record<number, string> = {
  3: "the report's latest three-month period (for example 7–9/2026 in a Q3 interim report, 4–6/2026 in a half-year report, 10–12/2026 in a financial statements release)",
  6: "the report's latest six-month period (for example 1–6/2026 in a half-year report, 7–12/2026 in a financial statements release)",
  12: "the report's financial year (for example 1–12/2026 in a financial statements release)",
};

function instructions(months: number) {
  return `You extract financial figures from the attached PDF report of a Finnish listed company: an interim report, a half-year report or a financial statements release.

Return figures for ${PERIODS[months]} and for the same period one year earlier. Prefer the consolidated income statement.

Rules:
- Use only figures printed in the report. Never calculate, estimate or infer a figure, for example from cumulative or full-year figures. If a field's figure isn't printed for a period, leave the field out of that period's list.
- List each field at most once per period.
- Signs by effect on profit: income and profits positive; costs, expenses, depreciation, taxes and losses negative, regardless of how the report prints them.
- Return all figures in the unit you report in \`unit\`, as plain numbers (the report may use decimal commas and spaces as thousand separators).

Fields (names in Finnish):`;
}

const periodSchema = z.object({
  startDate: z.string().describe("First day of the period, YYYY-MM-DD"),
  endDate: z.string().describe("Last day of the period, YYYY-MM-DD"),
});

// Figures are lists that leave out missing values instead of nullable values per field:
// providers limit the number of union-typed (e.g. nullable) parameters in a schema.
function reportSchema(fields: { id: number }[]) {
  const figures = z.array(
    z.object({
      field: z.enum(fields.map((field) => fieldKey(field.id)) as [string, ...string[]]),
      value: z.number(),
    }),
  );
  return z.object({
    unit: z
      .enum(["one", "thousand", "million"])
      .describe("Unit of all figures: euros, thousands of euros or millions of euros"),
    period: periodSchema.describe("The period to read figures for"),
    referencePeriod: periodSchema.describe("The same period one year earlier"),
    current: figures.describe("Figures for `period`"),
    reference: figures.describe("Figures for `referencePeriod`"),
  });
}

// Values by field key. A field listed more than once with different values is ambiguous,
// so it's left out.
function figureValues(figures: { field: string; value: number }[]): Map<string, number> {
  const values = new Map<string, number>();
  const ambiguous = new Set<string>();
  for (const { field, value } of figures) {
    if (values.has(field) && values.get(field) !== value) ambiguous.add(field);
    values.set(field, value);
  }
  for (const field of ambiguous) values.delete(field);
  return values;
}

function fieldKey(id: number) {
  return `field_${id}`;
}

// Links don't always name the file (e.g. ".../Resource/Download/0f79…" labelled
// "Harvia-Oyj-Osavuosikatsaus-Q2-2026-FIN"), so at most this many are downloaded to check.
const MAX_PDF_CANDIDATES = 5;

function looksLikePdf(attachment: { url: string; name: string | null }) {
  return [attachment.name ?? "", new URL(attachment.url).pathname].some((name) =>
    name.toLowerCase().endsWith(".pdf"),
  );
}

// The first attachment that is a PDF, as a base64 data URL. Attachments named like PDFs are
// tried first, then the rest by their content.
export async function findPdf(attachments: { url: string; name: string | null }[]) {
  const candidates = [
    ...attachments.filter(looksLikePdf),
    ...attachments.filter((attachment) => !looksLikePdf(attachment)),
  ].slice(0, MAX_PDF_CANDIDATES);
  for (const attachment of candidates) {
    const fileData = await downloadPdf(attachment.url);
    if (fileData) return { name: attachment.name, fileData };
  }
  return undefined;
}

// The file at the URL as a base64 data URL, or undefined when it isn't a PDF.
async function downloadPdf(url: string): Promise<string | undefined> {
  const response = await fetch(url);
  if (!response.ok) {
    console.warn("Attachment download failed", { url, status: response.status });
    await response.body?.cancel();
    return undefined;
  }
  // Skip pages and images without downloading them. Servers that don't know the type send
  // octet-stream or nothing, so those are checked by content.
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType && !/pdf|octet-stream/.test(contentType)) {
    await response.body?.cancel();
    return undefined;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_PDF_BYTES) throw new Error(`PDF is too large: ${bytes.length} bytes`);
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return undefined;
  return `data:application/pdf;base64,${bytes.toString("base64")}`;
}

export type ExtractResultsResult =
  | { saved: true; seasonId: number; referenceSeasonId: number; rowCount: number }
  | {
      saved: false;
      reason: "notFound" | "notReport" | "noPdf" | "noFields" | "invalidPeriod" | "noSeason";
    };

// Extracts the income statement figures of the report attached to a news item with AI and saves
// them for the report's latest reporting season (a quarter, half-year or financial year, as long as
// the company's seasons) and the same season a year earlier, creating the earlier financial year
// when missing. Report season values are added unless the season is confirmed; reference season
// values only where the season has no value yet (also unless confirmed). Fields calculated from
// actual values are skipped.
export async function extractResultsFromNews(newsId: number): Promise<ExtractResultsResult> {
  const news = await prisma.news.findUnique({
    where: { id: newsId },
    select: {
      companyId: true,
      category: { select: { name: true } },
      attachments: { orderBy: { id: "asc" }, select: { url: true, name: true } },
    },
  });
  if (!news) return { saved: false, reason: "notFound" };
  if (!isReportCategory(news.category.name)) return { saved: false, reason: "notReport" };

  // Fields calculated from actual values can't have results.
  const fields = (
    await prisma.resultField.findMany({
      where: { resultFieldGroup: { companyId: news.companyId }, fieldDefinitions: { none: { kind: "actual" } } },
      orderBy: [{ resultFieldGroup: { order: "asc" } }, { order: "asc" }, { id: "asc" }],
      select: { id: true, name: true, resultFieldGroup: { select: { name: true } } },
    })
  ).map((field) => ({
    id: field.id,
    name: [field.resultFieldGroup.name, field.name].filter(Boolean).join(": "),
  }));
  if (fields.length === 0) return { saved: false, reason: "noFields" };

  // Reporting seasons are as long as in the company's latest financial year.
  const latestYear = await prisma.financialYear.findFirst({
    where: { companyId: news.companyId },
    orderBy: [{ startTime: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    select: { _count: { select: { reportingSeasons: true } } },
  });
  const months = seasonMonths(latestYear?._count.reportingSeasons ?? 0);
  if (!months) return { saved: false, reason: "noSeason" };

  // Downloaded only now: finding the PDF may take several downloads.
  const pdf = await findPdf(news.attachments);
  if (!pdf) return { saved: false, reason: "noPdf" };

  const report = await structuredCompletion({
    schemaName: "report_figures",
    schema: reportSchema(fields),
    messages: [
      {
        role: "system",
        content: [instructions(months), ...fields.map((field) => `- ${fieldKey(field.id)}: ${field.name}`)].join("\n"),
      },
      {
        role: "user",
        content: [
          { type: "file", file: { filename: pdf.name ?? "report.pdf", file_data: pdf.fileData } },
        ],
      },
    ],
  });

  const parsePeriod = ({ startDate, endDate }: z.infer<typeof periodSchema>) => {
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
    return start && end ? { start, end } : undefined;
  };
  const period = parsePeriod(report.period);
  const referencePeriod = parsePeriod(report.referencePeriod);
  if (!period || !referencePeriod) return { saved: false, reason: "invalidPeriod" };

  const multiplier = UNIT_MULTIPLIERS[report.unit];
  const values = { current: figureValues(report.current), reference: figureValues(report.reference) };
  const valueOf = (fieldId: number, key: "current" | "reference") => {
    const value = values[key].get(fieldKey(fieldId));
    return value === undefined ? undefined : BigInt(Math.round(value * multiplier));
  };

  return prisma.$transaction(
    async (tx) => {
      const season = await findOrCreateReportingSeason(tx, news.companyId, period);
      const referenceSeason = await findOrCreateReportingSeason(tx, news.companyId, referencePeriod);
      if (!season || !referenceSeason) return { saved: false, reason: "noSeason" } as const;

      // A field may have become calculated while the report was being read.
      const calculated = new Set(
        (
          await tx.fieldDefinition.findMany({
            where: { kind: "actual", resultFieldId: { in: fields.map((field) => field.id) } },
            select: { resultFieldId: true },
          })
        ).map((definition) => definition.resultFieldId),
      );
      const savedFields = fields.filter((field) => !calculated.has(field.id));

      // result_row is insert-only, so new values are new rows.
      const rows: { reportingSeasonId: number; resultFieldId: number; value: bigint }[] = [];
      if (!season.confirmed) {
        for (const field of savedFields) {
          const value = valueOf(field.id, "current");
          if (value !== undefined) rows.push({ reportingSeasonId: season.id, resultFieldId: field.id, value });
        }
      }
      if (!referenceSeason.confirmed) {
        const filled = new Set(
          (
            await tx.resultRow.findMany({
              where: { reportingSeasonId: referenceSeason.id, value: { not: null } },
              select: { resultFieldId: true },
            })
          ).map((row) => row.resultFieldId),
        );
        for (const field of savedFields) {
          const value = valueOf(field.id, "reference");
          if (value !== undefined && !filled.has(field.id)) {
            rows.push({ reportingSeasonId: referenceSeason.id, resultFieldId: field.id, value });
          }
        }
      }

      await tx.resultRow.createMany({ data: rows.map((row) => ({ ...row, newsId })) });
      return {
        saved: true,
        seasonId: season.id,
        referenceSeasonId: referenceSeason.id,
        rowCount: rows.length,
      } as const;
    },
    { timeout: 15_000 },
  );
}
