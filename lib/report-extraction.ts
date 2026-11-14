import "server-only";
import { z } from "zod";
import type { Unit } from "@/app/generated/prisma/client";
import { seasonMonths } from "@/lib/financial-year";
import { structuredCompletion } from "@/lib/openrouter";
import { latestRows } from "@/lib/latest-rows";
import { prisma } from "@/lib/prisma";
import { findFinancialYear, findOrCreateReportingSeason, parseLocalDate } from "@/lib/reporting-season";

// Category of news whose report also has the figures of the whole financial year.
const STATEMENTS_CATEGORY = "Tilinpäätöstiedote";

// Categories of news whose PDF attachment is a report with an income statement.
export const REPORT_CATEGORIES = ["Osavuosikatsaus", STATEMENTS_CATEGORY];

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

// Fields reported only yearly are read from financial statements releases, for the whole year.
function yearlyInstructions(readYearly: boolean) {
  return readYearly
    ? "Also return figures for the report's whole financial year (for example 1–12/2026) and for the previous financial year, only for the fields listed for `yearly`."
    : "Return `yearly` and `referenceYearly` as empty lists, with the report's financial year and the previous one as their periods.";
}

function fieldList(fields: { id: number; name: string }[]) {
  return fields.length > 0 ? fields.map((field) => `- ${fieldKey(field.id)}: ${field.name}`) : ["(none)"];
}

function instructions(
  months: number,
  periodFields: { id: number; name: string }[],
  yearlyFields: { id: number; name: string }[] | undefined,
) {
  const lines = [
    `You extract financial figures from the attached PDF report of a Finnish listed company: an interim report, a half-year report or a financial statements release.

Return figures for ${PERIODS[months]} and for the same period one year earlier. Prefer the consolidated income statement.
${yearlyInstructions(yearlyFields != null)}

Rules:
- Use only figures printed in the report. Never calculate, estimate or infer a figure, for example from cumulative or full-year figures. If a field's figure isn't printed for a period, leave the field out of that period's list.
- List each field at most once per period.
- Signs by effect on profit: income and profits positive; costs, expenses, depreciation, taxes and losses negative, regardless of how the report prints them.
- Return all figures in the unit you report in \`unit\`, as plain numbers (the report may use decimal commas and spaces as thousand separators).

Fields for \`current\` and \`reference\` (names in Finnish):`,
    ...fieldList(periodFields),
  ];
  if (yearlyFields) {
    lines.push("", "Fields for `yearly` and `referenceYearly` (names in Finnish):", ...fieldList(yearlyFields));
  }
  return lines.join("\n");
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
    yearPeriod: periodSchema.describe("The report's financial year"),
    referenceYearPeriod: periodSchema.describe("The previous financial year"),
    yearly: figures.describe("Figures for `yearPeriod`"),
    referenceYearly: figures.describe("Figures for `referenceYearPeriod`"),
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
  | {
      saved: true;
      seasonId: number;
      referenceSeasonId: number;
      // Financial years of the yearly figures; null when none were read or the year wasn't found.
      yearId: number | null;
      referenceYearId: number | null;
      rowCount: number;
    }
  | {
      saved: false;
      reason: "notFound" | "notReport" | "noPdf" | "noFields" | "invalidPeriod" | "noSeason";
    };

// Which values a period's new values may replace: "all" replaces every value, "extracted" only
// values extracted from news (not those entered by hand), and "empty" none, filling only fields
// with no value yet.
type Overwrite = "all" | "extracted" | "empty";

// Extracts the income statement figures of the report attached to a news item with AI and saves
// them for the report's latest reporting season (a quarter, half-year or financial year, as long as
// the company's seasons) and the same season a year earlier, creating the earlier financial year
// when missing. Fields reported only yearly are read from financial statements releases instead,
// for the report's financial year and the previous one. Report period values are added unless the
// season or year is confirmed; reference period values only where the period has no value yet
// (also unless confirmed). Fields calculated from actual values are skipped.
//
// With `refetchFieldIds`, only those fields are extracted, for fields added after the news was
// received: report period values replace values extracted from news but not those entered by hand,
// and confirmed periods and reference periods get values only for fields with no value yet.
export async function extractResultsFromNews(
  newsId: number,
  refetchFieldIds?: number[],
): Promise<ExtractResultsResult> {
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
      where: {
        resultFieldGroup: { companyId: news.companyId },
        fieldDefinitions: { none: { kind: "actual" } },
        ...(refetchFieldIds && { id: { in: refetchFieldIds } }),
      },
      orderBy: [{ resultFieldGroup: { order: "asc" } }, { order: "asc" }, { id: "asc" }],
      select: { id: true, name: true, yearlyValue: true, resultFieldGroup: { select: { name: true } } },
    })
  ).map((field) => ({
    id: field.id,
    name: [field.resultFieldGroup.name, field.name].filter(Boolean).join(": "),
    yearlyOnly: field.yearlyValue === "yearly_only",
  }));
  const periodFields = fields.filter((field) => !field.yearlyOnly);
  const yearlyFields =
    news.category.name === STATEMENTS_CATEGORY ? fields.filter((field) => field.yearlyOnly) : [];
  const readYearly = yearlyFields.length > 0;
  if (periodFields.length === 0 && !readYearly) return { saved: false, reason: "noFields" };

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
    schema: reportSchema([...periodFields, ...yearlyFields]),
    messages: [
      { role: "system", content: instructions(months, periodFields, readYearly ? yearlyFields : undefined) },
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
  // Yearly figures are skipped when their periods are invalid; the seasons' figures are still saved.
  const yearPeriod = readYearly ? parsePeriod(report.yearPeriod) : undefined;
  const referenceYearPeriod = readYearly ? parsePeriod(report.referenceYearPeriod) : undefined;

  const multiplier = UNIT_MULTIPLIERS[report.unit];
  const values = {
    current: figureValues(report.current),
    reference: figureValues(report.reference),
    yearly: figureValues(report.yearly),
    referenceYearly: figureValues(report.referenceYearly),
  };
  const valueOf = (fieldId: number, key: keyof typeof values) => {
    const value = values[key].get(fieldKey(fieldId));
    return value === undefined ? undefined : BigInt(Math.round(value * multiplier));
  };

  return prisma.$transaction(
    async (tx) => {
      const season = await findOrCreateReportingSeason(tx, news.companyId, period);
      const referenceSeason = await findOrCreateReportingSeason(tx, news.companyId, referencePeriod);
      if (!season || !referenceSeason) return { saved: false, reason: "noSeason" } as const;
      // The seasons' financial years were created above when missing.
      const year = yearPeriod && (await findFinancialYear(tx, news.companyId, yearPeriod));
      const referenceYear =
        referenceYearPeriod && (await findFinancialYear(tx, news.companyId, referenceYearPeriod));

      // A field may have become calculated, or reported only yearly or not, while the report was
      // being read.
      const current = await tx.resultField.findMany({
        where: { id: { in: fields.map((field) => field.id) }, fieldDefinitions: { none: { kind: "actual" } } },
        select: { id: true, yearlyValue: true },
      });
      const yearlyOnly = new Map(current.map((field) => [field.id, field.yearlyValue === "yearly_only"]));
      const savedPeriodFields = periodFields.filter((field) => yearlyOnly.get(field.id) === false);
      const savedYearlyFields = yearlyFields.filter((field) => yearlyOnly.get(field.id) === true);

      // result_row is insert-only, so new values are new rows.
      type Period = { reportingSeasonId: number } | { financialYearId: number };
      const rows: (Period & { resultFieldId: number; value: bigint })[] = [];
      // Values of the fields for the period that the period's current values allow; none with
      // overwrite undefined.
      const addRows = async (
        period: Period,
        savedFields: { id: number }[],
        key: keyof typeof values,
        overwrite: Overwrite | undefined,
      ) => {
        if (!overwrite) return;
        const latest = new Map(
          latestRows(
            overwrite === "all"
              ? []
              : await tx.resultRow.findMany({
                  where: { ...period, resultFieldId: { in: savedFields.map((field) => field.id) } },
                  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                  select: { resultFieldId: true, value: true, newsId: true },
                }),
            (row) => row.resultFieldId,
          ).map((row) => [row.resultFieldId, row]),
        );
        for (const field of savedFields) {
          const value = valueOf(field.id, key);
          if (value === undefined) continue;
          const current = latest.get(field.id);
          const replaceable =
            current?.value == null || (overwrite === "extracted" && current.newsId != null && current.value !== value);
          if (replaceable) rows.push({ ...period, resultFieldId: field.id, value });
        }
      };
      // Overwrites of the report's own period and the reference period, by whether it's confirmed.
      const reportOverwrite = (confirmed: boolean): Overwrite | undefined =>
        refetchFieldIds ? (confirmed ? "empty" : "extracted") : confirmed ? undefined : "all";
      const referenceOverwrite = (confirmed: boolean): Overwrite | undefined =>
        refetchFieldIds || !confirmed ? "empty" : undefined;
      await addRows({ reportingSeasonId: season.id }, savedPeriodFields, "current", reportOverwrite(season.confirmed));
      await addRows(
        { reportingSeasonId: referenceSeason.id },
        savedPeriodFields,
        "reference",
        referenceOverwrite(referenceSeason.confirmed),
      );
      if (year) await addRows({ financialYearId: year.id }, savedYearlyFields, "yearly", reportOverwrite(year.confirmed));
      if (referenceYear) {
        await addRows(
          { financialYearId: referenceYear.id },
          savedYearlyFields,
          "referenceYearly",
          referenceOverwrite(referenceYear.confirmed),
        );
      }

      await tx.resultRow.createMany({ data: rows.map((row) => ({ ...row, newsId })) });
      return {
        saved: true,
        seasonId: season.id,
        referenceSeasonId: referenceSeason.id,
        yearId: year?.id ?? null,
        referenceYearId: referenceYear?.id ?? null,
        rowCount: rows.length,
      } as const;
    },
    { timeout: 15_000 },
  );
}
