"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import {
  applySettings,
  createCompanyWithSettings,
  settingsProblems,
  settingsSchema,
  type AppliedSettings,
  type CompanySettings,
} from "@/lib/default-company-settings";
import { calendarFinancialYear, REPORTING_CYCLES, type ReportingCycle } from "@/lib/financial-year";
import { prisma } from "@/lib/prisma";
import { fetchIssuers, fetchShares } from "@/lib/nasdaq";
import { shareOptions, type ShareOption } from "@/lib/nasdaq-news";
import { startNewsBackfill } from "@/lib/nasdaq-news-fetch";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { priceSymbol } from "@/lib/stock-price";

export async function getCompanies() {
  await requireUserId();
  return prisma.company.findMany({ orderBy: { name: "asc" } });
}

export async function getCompany(ticker: string) {
  await requireUserId();
  return prisma.company.findUnique({ where: { ticker } });
}

// Names of the issuers on Nasdaq Helsinki for choosing a company's Nasdaq issuer; empty when the
// list can't be fetched.
export async function getNasdaqIssuers(): Promise<string[]> {
  await requireUserId();
  try {
    return await fetchIssuers();
  } catch (error) {
    console.error("Fetching Nasdaq issuers failed", error);
    return [];
  }
}

// The shares on Nasdaq Helsinki for creating a company from, with the company's name and Nasdaq
// issuer; empty when the lists can't be fetched.
export async function getNasdaqShares(): Promise<ShareOption[]> {
  await requireUserId();
  try {
    const [shares, issuers] = await Promise.all([fetchShares(), fetchIssuers()]);
    return shareOptions(shares, issuers);
  } catch (error) {
    console.error("Fetching Nasdaq shares failed", error);
    return [];
  }
}

// An empty price symbol stands for the default one (see lib/stock-price.ts). An empty Nasdaq name
// is matched by the company's name when the company is created, and otherwise means that the
// company's news aren't fetched from Nasdaq.
export type CompanyInput = { name: string; ticker: string; priceSymbol?: string; nasdaqName?: string };

// Error values are translation keys under CompanyForm.errors.
export type CompanyFormError = "required" | "tooLong" | "tickerTaken";
export type CompanyFormErrors = Partial<Record<keyof CompanyInput, CompanyFormError[]>>;

const companySchema = z.object({
  name: z.string().trim().min(1, "required").max(200, "tooLong"),
  ticker: z.string().trim().toUpperCase().min(1, "required").max(20, "tooLong"),
  priceSymbol: z
    .string()
    .trim()
    .toUpperCase()
    .max(30, "tooLong")
    .optional()
    .transform((value) => value || null),
  nasdaqName: z
    .string()
    .trim()
    .max(200, "tooLong")
    .optional()
    .transform((value) => value || null),
});

// Validation errors of a company to be created, before its result fields are reviewed. The ticker
// may still be taken by the time the company is created.
export async function validateCompany(input: CompanyInput): Promise<{ errors?: CompanyFormErrors }> {
  await requireUserId();

  const parsed = companySchema.safeParse(input);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return { errors: fieldErrors as CompanyFormErrors };
  }
  const existing = await prisma.company.findUnique({ where: { ticker: parsed.data.ticker }, select: { id: true } });
  return existing ? { errors: { ticker: ["tickerTaken"] } } : {};
}

// Creates the company with the reviewed settings and the current calendar year as its financial
// year, divided into reporting seasons by the reporting cycle. The settings come from the client's
// draft, which the user can't make invalid, so invalid settings throw.
export async function createCompany(
  input: CompanyInput & { reportingCycle: ReportingCycle; settings: CompanySettings },
): Promise<{ errors?: CompanyFormErrors }> {
  await requireUserId();

  // Parameters come from the client, so validate them despite the type.
  const parsed = companySchema.safeParse(input);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return { errors: fieldErrors as CompanyFormErrors };
  }
  const cycle = z.enum(REPORTING_CYCLES).parse(input.reportingCycle);
  const settings = settingsSchema.parse(input.settings);
  const problems = settingsProblems(settings);
  if (problems.length > 0) throw new Error(`Invalid company settings: ${problems.join("; ")}`);

  let company;
  try {
    // The company, its financial year, seasons, result fields and formulas in one transaction.
    company = await prisma.$transaction((tx) =>
      createCompanyWithSettings(
        tx,
        { ...parsed.data, financialYears: { create: calendarFinancialYear({ cycle }) } },
        settings,
      ),
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { errors: { ticker: ["tickerTaken"] } };
    }
    throw error;
  }

  startNewsBackfill(company.id);
  return {};
}

// Updates the company's name, ticker, price symbol and Nasdaq issuer. A changed ticker changes the
// company's URLs, so then this redirects to the settings page under the new ticker. A changed price
// symbol (also by a changed ticker) clears the failure of the latest price fetch and lets the prices
// be fetched again right away. A changed Nasdaq issuer lets the news be fetched again right away.
export async function updateCompany(
  input: CompanyInput & { companyId: number },
): Promise<{ errors?: CompanyFormErrors }> {
  await requireUserId();

  const parsed = companySchema.safeParse(input);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return { errors: fieldErrors as CompanyFormErrors };
  }
  const id = z.number().int().positive().parse(input.companyId);

  const company = await prisma.company.findUnique({
    where: { id },
    select: { ticker: true, priceSymbol: true, nasdaqName: true },
  });
  if (!company) return {};
  const symbolChanged = priceSymbol(parsed.data) !== priceSymbol(company);
  const issuerChanged = parsed.data.nasdaqName !== company.nasdaqName;

  try {
    await prisma.company.update({
      where: { id },
      data: {
        ...parsed.data,
        ...(symbolChanged && { pricesFetchedAt: null, pricesFetchError: null }),
        ...(issuerChanged && { newsFetchedAt: null }),
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { errors: { ticker: ["tickerTaken"] } };
    }
    throw error;
  }

  if (parsed.data.ticker !== company.ticker) {
    redirect(`/dashboard/company/${encodeURIComponent(parsed.data.ticker)}/settings`);
  }
  refresh();
  return {};
}

// Adds the parts of the default settings the company doesn't have yet.
export async function applyDefaultSettings(input: { companyId: number }): Promise<AppliedSettings> {
  await requireUserId();
  const companyId = z.number().int().positive().parse(input.companyId);

  const applied = await prisma.$transaction((tx) => applySettings(tx, companyId));
  refresh();
  return applied;
}
