"use server";

import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { loadMultiples, loadMultipleValueRows, multipleValuesAsOf } from "@/lib/company-data";
import { prisma } from "@/lib/prisma";
import { toStoredMultiple } from "@/lib/valuation";
import type { ValuationBasis } from "@/app/generated/prisma/client";
import { ResultFieldType } from "@/app/generated/prisma/enums";

export type ValuationMultipleSummary = {
  id: number;
  name: string;
  resultFieldId: number;
  basis: ValuationBasis;
};

export type CompanyValuationData = {
  multiples: ValuationMultipleSummary[];
  // Multiple values by scenario id, then by multiple id.
  values: Record<number, Record<number, number | null>>;
  targetYearId: number | null;
  // Ids of the company's fields by special type; null if the company doesn't have one.
  fieldIds: Record<ResultFieldType, number | null>;
};

// A company's valuation multiples with their values in every scenario, the target year and the
// result fields the valuation and the DCF need.
export async function getValuation(companyId: number): Promise<CompanyValuationData> {
  await requireUserId();

  const [multiples, values, valuation, typedFields] = await Promise.all([
    loadMultiples(companyId),
    loadMultipleValueRows(companyId),
    prisma.companyValuation.findUnique({
      where: { companyId },
      select: { targetFinancialYearId: true },
    }),
    prisma.resultField.findMany({
      where: { resultFieldGroup: { companyId }, type: { not: null } },
      orderBy: { id: "asc" },
      select: { id: true, type: true },
    }),
  ]);

  return {
    multiples,
    values: multipleValuesAsOf(values),
    targetYearId: valuation?.targetFinancialYearId ?? null,
    fieldIds: Object.fromEntries(
      Object.values(ResultFieldType).map((type) => [type, typedFields.find((field) => field.type === type)?.id ?? null]),
    ) as Record<ResultFieldType, number | null>,
  };
}

const idSchema = z.number().int().positive();

const saveValueSchema = z.object({
  scenarioId: idSchema,
  multipleId: idSchema,
  // Keeps the stored hundredths well within int.
  value: z.number().min(-1e6).max(1e6).nullable(),
});

// Saves a valuation multiple's value in a scenario, rounded to hundredths; null clears it.
export async function saveMultipleValue(input: {
  scenarioId: number;
  multipleId: number;
  value: number | null;
}): Promise<{ saved: boolean }> {
  await requireUserId();

  const parsed = saveValueSchema.safeParse(input);
  if (!parsed.success) return { saved: false };
  const { scenarioId, multipleId, value } = parsed.data;

  // The scenario and the multiple must belong to the same company.
  const scenario = await prisma.estimateScenario.findUnique({
    where: { id: scenarioId },
    select: { companyId: true },
  });
  if (!scenario) return { saved: false };
  const multiples = await prisma.valuationMultiple.count({
    where: { id: multipleId, companyId: scenario.companyId },
  });
  if (multiples === 0) return { saved: false };

  const stored = value == null ? null : toStoredMultiple(value);
  // Insert-only: a new value is a new row.
  await prisma.valuationMultipleValue.create({
    data: { estimateScenarioId: scenarioId, valuationMultipleId: multipleId, value: stored },
  });
  return { saved: true };
}

const targetYearSchema = z.object({ companyId: idSchema, financialYearId: idSchema });

// Sets the financial year whose estimates the company's valuation uses.
export async function setValuationTargetYear(input: {
  companyId: number;
  financialYearId: number;
}): Promise<{ saved: boolean }> {
  await requireUserId();

  const parsed = targetYearSchema.safeParse(input);
  if (!parsed.success) return { saved: false };
  const { companyId, financialYearId } = parsed.data;

  const years = await prisma.financialYear.count({ where: { id: financialYearId, companyId } });
  if (years === 0) return { saved: false };

  await prisma.companyValuation.upsert({
    where: { companyId },
    create: { companyId, targetFinancialYearId: financialYearId },
    update: { targetFinancialYearId: financialYearId },
  });
  return { saved: true };
}
