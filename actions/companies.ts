"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
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
    // Nested create keeps the company, its financial year and quarters in one transaction.
    await prisma.company.create({
      data: { ...parsed.data, financialYears: { create: calendarFinancialYear() } },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { errors: { ticker: ["tickerTaken"] } };
    }
    throw error;
  }

  redirect("/dashboard");
}
