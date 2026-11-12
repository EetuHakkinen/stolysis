import "server-only";
import { z } from "zod";
import { createCompanyWithSettings } from "@/lib/default-company-settings";
import { financialYear } from "@/lib/financial-year";
import type { ContentPart } from "@/lib/openrouter";
import { structuredCompletion } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { findPdf } from "@/lib/report-extraction";
import { parseLocalDate } from "@/lib/reporting-season";

// Companies created from reports of companies that aren't in the database yet. AI reads the
// company's name, financial year and reporting cycle from the report, and looks up its ticker
// on the web.

const PROFILE_INSTRUCTIONS = `You read a report of a listed company (an interim report, a half-year report or a financial statements release) and its stock exchange release, and return facts about the company.

- companyName: the company's official name as printed, with its company form, e.g. "Harvia Oyj".
- financialYearStart, financialYearEnd: the first and last day of the financial year the report belongs to.
- reportingCycle: how often the company reports its results.
  - quarterly: the report has figures for three-month periods (e.g. 4–6/2026, Q2 or "huhti–kesäkuu"). A financial statements release of a quarterly reporter has figures for the last quarter (e.g. 10–12/2026).
  - halfYearly: the company reports six-month periods (e.g. 1–6/2026 and 7–12/2026) but no three-month periods.
  - yearly: the company reports only full financial years.
- unit: the unit of the report's income statement figures.
- isCompanyReport: false if this is not a report of a single listed company.`;

const profileSchema = z.object({
  isCompanyReport: z.boolean().describe("Whether this is a report of a single listed company"),
  companyName: z.string().describe("Official name of the company"),
  financialYearStart: z.string().describe("First day of the financial year, YYYY-MM-DD"),
  financialYearEnd: z.string().describe("Last day of the financial year, YYYY-MM-DD"),
  reportingCycle: z.enum(["quarterly", "halfYearly", "yearly"]),
  unit: z
    .enum(["one", "thousand", "million"])
    .describe("Unit of the figures: euros, thousands of euros or millions of euros"),
});

const tickerSchema = z.object({
  ticker: z
    .string()
    .describe("The company's trading code, e.g. HARVIA, or an empty string when not found"),
});

export type ReportRelease = {
  title: string;
  description: string;
  attachments: { url: string; name?: string }[];
};

// The company of a report release, created with its financial year (divided by its reporting
// cycle) and the default settings. When the ticker found belongs to a company already in the
// database, that company is returned instead. Undefined when the report doesn't tell enough.
export async function findOrCreateCompanyFromReport(
  release: ReportRelease,
): Promise<{ id: number; created: boolean } | undefined> {
  const pdf = await findPdf(
    release.attachments.map((attachment) => ({ url: attachment.url, name: attachment.name ?? null })),
  );
  const content: ContentPart[] = [
    { type: "text", text: `Release: ${release.title}\n\n${release.description}` },
  ];
  if (pdf) {
    content.push({ type: "file", file: { filename: pdf.name ?? "report.pdf", file_data: pdf.fileData } });
  }

  const profile = await structuredCompletion({
    schemaName: "company_profile",
    schema: profileSchema,
    messages: [
      { role: "system", content: PROFILE_INSTRUCTIONS },
      { role: "user", content },
    ],
  });
  const name = profile.companyName.trim();
  const start = parseLocalDate(profile.financialYearStart);
  const end = parseLocalDate(profile.financialYearEnd);
  if (!profile.isCompanyReport || !name || name.length > 200 || !start || !end) return undefined;
  // Seasons are whole months, so only 12-month financial years that start on the 1st are supported.
  const endsAfter12Months =
    start.day === 1 &&
    new Date(Date.UTC(start.year, start.month + 12, 0)).getTime() ===
      Date.UTC(end.year, end.month, end.day);
  if (!endsAfter12Months) {
    console.warn("Financial year from report is not 12 months", { name, start, end });
    return undefined;
  }

  const ticker = await findTicker(name);
  if (!ticker) {
    console.warn("Ticker of company not found", { name });
    return undefined;
  }

  const existing = await prisma.company.findUnique({ where: { ticker }, select: { id: true } });
  if (existing) return { id: existing.id, created: false };

  try {
    // The company, its financial year, seasons, result fields and formulas in one transaction.
    const company = await prisma.$transaction((tx) =>
      createCompanyWithSettings(tx, {
        name,
        ticker,
        financialYears: {
          create: financialYear({
            year: start.year,
            startMonth: start.month,
            cycle: profile.reportingCycle,
            unit: profile.unit,
          }),
        },
      }),
    );
    return { id: company.id, created: true };
  } catch (error) {
    // Another release of the same company created it first.
    if (isUniqueConstraintError(error)) {
      const company = await prisma.company.findUnique({ where: { ticker }, select: { id: true } });
      if (company) return { id: company.id, created: false };
    }
    throw error;
  }
}

// The company's trading code, searched on the web.
async function findTicker(companyName: string): Promise<string | undefined> {
  const { ticker } = await structuredCompletion({
    schemaName: "company_ticker",
    schema: tickerSchema,
    webSearch: true,
    messages: [
      {
        role: "user",
        content: `Search the web for the trading code (ticker) of the listed company "${companyName}" on its main stock exchange (Nasdaq Helsinki for Finnish companies). Return only the trading code, without the exchange or a suffix such as ".HE".`,
      },
    ],
  });
  const normalized = ticker.trim().toUpperCase();
  // The same limits as for companies created by hand.
  return normalized && normalized.length <= 20 ? normalized : undefined;
}
