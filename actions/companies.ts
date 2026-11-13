"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { applySettings, createCompanyWithSettings, type AppliedSettings } from "@/lib/default-company-settings";
import { calendarFinancialYear } from "@/lib/financial-year";
import { prisma } from "@/lib/prisma";
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

// An empty price symbol stands for the default one (see lib/stock-price.ts).
export type CompanyInput = { name: string; ticker: string; priceSymbol?: string };

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
});

export async function createCompany(
  input: CompanyInput,
): Promise<{ errors?: CompanyFormErrors }> {
  await requireUserId();

  // Parameters come from the client, so validate them despite the type.
  const parsed = companySchema.safeParse(input);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return { errors: fieldErrors as CompanyFormErrors };
  }

  try {
    // The company, its financial year, quarters, result fields and formulas in one transaction.
    await prisma.$transaction((tx) =>
      createCompanyWithSettings(tx, { ...parsed.data, financialYears: { create: calendarFinancialYear() } }),
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { errors: { ticker: ["tickerTaken"] } };
    }
    throw error;
  }

  redirect("/dashboard");
}

// Updates the company's name, ticker and price symbol. A changed ticker changes the company's URLs, so then this
// redirects to the settings page under the new ticker. A changed price symbol (also by a changed
// ticker) clears the failure of the latest price fetch and lets the prices be fetched again right
// away.
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

  const company = await prisma.company.findUnique({ where: { id }, select: { ticker: true, priceSymbol: true } });
  if (!company) return {};
  const symbolChanged = priceSymbol(parsed.data) !== priceSymbol(company);

  try {
    await prisma.company.update({
      where: { id },
      data: { ...parsed.data, ...(symbolChanged && { pricesFetchedAt: null, pricesFetchError: null }) },
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
