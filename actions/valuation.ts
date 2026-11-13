"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { loadMultiples, loadMultipleValueRows, loadTypedFieldIds, multipleValuesAsOf } from "@/lib/company-data";
import { isReordering } from "@/lib/ordering";
import { prisma } from "@/lib/prisma";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { toStoredMultiple } from "@/lib/valuation";
import { ResultFieldType, ValuationBasis } from "@/app/generated/prisma/enums";

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

  const [multiples, values, valuation, fieldIds] = await Promise.all([
    loadMultiples(companyId),
    loadMultipleValueRows(companyId),
    prisma.companyValuation.findUnique({
      where: { companyId },
      select: { targetFinancialYearId: true },
    }),
    loadTypedFieldIds(companyId),
  ]);

  return {
    multiples,
    values: multipleValuesAsOf(values),
    targetYearId: valuation?.targetFinancialYearId ?? null,
    fieldIds,
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

export type ValuationMultipleFields = { name: string; resultFieldId: number; basis: ValuationBasis };

// Error values are translation keys under ValuationMultiples.errors.
export type ValuationMultipleErrors = { name?: "required" | "tooLong" | "nameTaken" };

const multipleSchema = z.object({
  name: z.string().trim().min(1, "required").max(100, "tooLong"),
  resultFieldId: idSchema,
  basis: z.enum(ValuationBasis),
});

// The validated multiple, or the name's error. The result field must belong to the company.
async function parseMultiple(
  companyId: number,
  input: ValuationMultipleFields,
): Promise<{ data: z.infer<typeof multipleSchema> } | { errors: ValuationMultipleErrors }> {
  // Parameters come from the client, so validate them despite the type.
  const parsed = multipleSchema.safeParse(input);
  if (!parsed.success) {
    const nameIssue = parsed.error.issues.find((issue) => issue.path[0] === "name");
    if (!nameIssue) throw new Error("Invalid valuation multiple");
    return { errors: { name: nameIssue.message as "required" | "tooLong" } };
  }
  const fields = await prisma.resultField.count({
    where: { id: parsed.data.resultFieldId, resultFieldGroup: { companyId } },
  });
  if (fields === 0) throw new Error("Result field of another company");
  return { data: parsed.data };
}

// Whether another multiple of the company has the name, ignoring case.
async function multipleNameTaken(companyId: number, name: string, multipleId?: number) {
  const count = await prisma.valuationMultiple.count({
    where: { companyId, name: { equals: name, mode: "insensitive" }, id: { not: multipleId } },
  });
  return count > 0;
}

// Creates a valuation multiple after the company's other multiples.
export async function createValuationMultiple(
  input: { companyId: number } & ValuationMultipleFields,
): Promise<{ errors?: ValuationMultipleErrors }> {
  await requireUserId();

  const companyId = idSchema.parse(input.companyId);
  const parsed = await parseMultiple(companyId, input);
  if ("errors" in parsed) return parsed;
  const { data } = parsed;
  if (await multipleNameTaken(companyId, data.name)) return { errors: { name: "nameTaken" } };

  try {
    await prisma.$transaction(async (tx) => {
      const { _max } = await tx.valuationMultiple.aggregate({ where: { companyId }, _max: { order: true } });
      await tx.valuationMultiple.create({ data: { companyId, ...data, order: (_max.order ?? -1) + 1 } });
    });
  } catch (e) {
    if (isUniqueConstraintError(e)) return { errors: { name: "nameTaken" } };
    throw e;
  }
  refresh();
  return {};
}

// Changes a valuation multiple's name, result field and basis. Its values are kept.
export async function updateValuationMultiple(
  input: { multipleId: number } & ValuationMultipleFields,
): Promise<{ errors?: ValuationMultipleErrors }> {
  await requireUserId();

  const multipleId = idSchema.parse(input.multipleId);
  const { companyId } = await prisma.valuationMultiple.findUniqueOrThrow({
    where: { id: multipleId },
    select: { companyId: true },
  });
  const parsed = await parseMultiple(companyId, input);
  if ("errors" in parsed) return parsed;
  const { data } = parsed;
  if (await multipleNameTaken(companyId, data.name, multipleId)) return { errors: { name: "nameTaken" } };

  try {
    await prisma.valuationMultiple.update({ where: { id: multipleId }, data });
  } catch (e) {
    if (isUniqueConstraintError(e)) return { errors: { name: "nameTaken" } };
    throw e;
  }
  refresh();
  return {};
}

// Deletes the valuation multiple with its values in every scenario.
export async function deleteValuationMultiple(input: { multipleId: number }): Promise<{ deleted: boolean }> {
  await requireUserId();
  const multipleId = idSchema.parse(input.multipleId);

  const { count } = await prisma.valuationMultiple.deleteMany({ where: { id: multipleId } });
  refresh();
  return { deleted: count > 0 };
}

const reorderMultiplesSchema = z.object({
  companyId: idSchema,
  multipleIds: z.array(idSchema),
});

// Orders the company's valuation multiples as given. The ids must be exactly the company's multiples.
export async function reorderValuationMultiples(input: {
  companyId: number;
  multipleIds: number[];
}): Promise<{ saved: boolean }> {
  await requireUserId();

  const parsed = reorderMultiplesSchema.safeParse(input);
  if (!parsed.success) return { saved: false };
  const { companyId, multipleIds } = parsed.data;

  const saved = await prisma.$transaction(async (tx) => {
    const multiples = await tx.valuationMultiple.findMany({ where: { companyId }, select: { id: true } });
    if (!isReordering(multipleIds, multiples.map((multiple) => multiple.id))) return false;

    for (const [order, id] of multipleIds.entries())
      await tx.valuationMultiple.update({ where: { id }, data: { order } });
    return true;
  });
  if (saved) refresh();
  return { saved };
}
