"use server";

import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { latestRows } from "@/lib/latest-rows";
import { prisma } from "@/lib/prisma";
import { fromStoredMultiple, toStoredMultiple } from "@/lib/valuation";
import type { ValuationBasis } from "@/app/generated/prisma/client";

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
  // The company's net debt and share count fields; null if the company doesn't have one.
  netDebtFieldId: number | null;
  shareCountFieldId: number | null;
};

// A company's valuation multiples with their values in every scenario, the target year and the
// result fields the valuation needs.
export async function getValuation(companyId: number): Promise<CompanyValuationData> {
  await requireUserId();

  const [multiples, values, valuation, typedFields] = await Promise.all([
    prisma.valuationMultiple.findMany({
      where: { companyId },
      orderBy: [{ order: "asc" }, { id: "asc" }],
      select: { id: true, name: true, resultFieldId: true, basis: true },
    }),
    prisma.valuationMultipleValue.findMany({
      where: { valuationMultiple: { companyId } },
      // valuation_multiple_value is insert-only: newest first, so the first row per key is current.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { estimateScenarioId: true, valuationMultipleId: true, value: true },
    }),
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

  const scenarioValues: Record<number, Record<number, number | null>> = {};
  const currentValues = latestRows(values, (row) => `${row.estimateScenarioId}:${row.valuationMultipleId}`);
  for (const row of currentValues) {
    scenarioValues[row.estimateScenarioId] ??= {};
    scenarioValues[row.estimateScenarioId][row.valuationMultipleId] =
      row.value == null ? null : fromStoredMultiple(row.value);
  }

  return {
    multiples,
    values: scenarioValues,
    targetYearId: valuation?.targetFinancialYearId ?? null,
    netDebtFieldId: typedFields.find((field) => field.type === "net_debt")?.id ?? null,
    shareCountFieldId: typedFields.find((field) => field.type === "share_count")?.id ?? null,
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
