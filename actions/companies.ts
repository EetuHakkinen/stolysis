"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { createCompanyWithSettings } from "@/lib/default-company-settings";
import { calendarFinancialYear } from "@/lib/financial-year";
import { prisma } from "@/lib/prisma";
import { isUniqueConstraintError } from "@/lib/prisma-errors";

export async function getCompanies() {
  await requireUserId();
  return prisma.company.findMany({ orderBy: { name: "asc" } });
}

export async function getCompany(ticker: string) {
  await requireUserId();
  return prisma.company.findUnique({ where: { ticker } });
}

export type CompanyInput = { name: string; ticker: string };

// Error values are translation keys under CompanyForm.errors.
export type CompanyFormError = "required" | "tooLong" | "tickerTaken";
export type CompanyFormErrors = Partial<Record<keyof CompanyInput, CompanyFormError[]>>;

const companySchema = z.object({
  name: z.string().trim().min(1, "required").max(200, "tooLong"),
  ticker: z.string().trim().toUpperCase().min(1, "required").max(20, "tooLong"),
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

// Updates the company's name and ticker. A changed ticker changes the company's URLs, so then this
// redirects to the settings page under the new ticker.
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

  const company = await prisma.company.findUnique({ where: { id }, select: { ticker: true } });
  if (!company) return {};

  try {
    await prisma.company.update({ where: { id }, data: parsed.data });
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
