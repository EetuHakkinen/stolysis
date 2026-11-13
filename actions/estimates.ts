"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import {
  estimatesAsOf,
  estimateYears,
  loadEstimateFields,
  loadEstimateRows,
  loadFinancialYears,
  loadScenarios,
  YEARS_AHEAD,
} from "@/lib/company-data";
import { toStoredEstimate, type EstimateField, type EstimateInput, type EstimateYear } from "@/lib/estimates";
import { ensureFinancialYears } from "@/lib/financial-year";
import { prisma } from "@/lib/prisma";
import { isUniqueConstraintError } from "@/lib/prisma-errors";

export type EstimateScenarioSummary = { id: number; name: string };

export type CompanyEstimates = {
  scenarios: EstimateScenarioSummary[];
  // The company's financial years up to YEARS_AHEAD after the current one, oldest first.
  years: EstimateYear[];
  // Null when no financial year covers the current day.
  currentYearId: number | null;
  fields: EstimateField[];
  // Current estimates of the field's estimate type, by scenario id.
  estimates: Record<number, EstimateInput[]>;
};

// A company's estimate scenarios and the financial years and estimates needed to predict its
// result fields. Missing future financial years are created once the company has a scenario.
export async function getEstimates(companyId: number): Promise<CompanyEstimates> {
  await requireUserId();

  const scenarios = await loadScenarios(companyId);

  let years = estimateYears(await loadFinancialYears(companyId), new Date());
  if (scenarios.length > 0 && (years.currentIndex < 0 || years.after < YEARS_AHEAD)) {
    await prisma.$transaction((tx) => ensureFinancialYears(tx, companyId, YEARS_AHEAD));
    years = estimateYears(await loadFinancialYears(companyId), new Date());
  }

  const [{ fields, valueFormats }, rows] = await Promise.all([
    loadEstimateFields(companyId),
    loadEstimateRows(companyId),
  ]);

  return {
    scenarios,
    years: years.years,
    currentYearId: years.years[years.currentIndex]?.id ?? null,
    fields,
    estimates: estimatesAsOf({ rows, fields, valueFormats, scenarioIds: scenarios.map((scenario) => scenario.id) }),
  };
}

// A company's estimate scenarios, oldest first.
export async function getEstimateScenarios(companyId: number): Promise<EstimateScenarioSummary[]> {
  await requireUserId();
  return loadScenarios(companyId);
}

// Error values are translation keys under Estimates.errors.
export type ScenarioNameError = "required" | "tooLong" | "nameTaken";

const nameSchema = z.string().trim().min(1, "required").max(100, "tooLong");

function nameError(name: unknown): ScenarioNameError | undefined {
  const parsed = nameSchema.safeParse(name);
  return parsed.success ? undefined : (parsed.error.issues[0].message as ScenarioNameError);
}

const idSchema = z.number().int().positive();

export async function createEstimateScenario(input: {
  companyId: number;
  name: string;
}): Promise<{ id?: number; error?: ScenarioNameError }> {
  await requireUserId();

  // Parameters come from the client, so validate them despite the type.
  const error = nameError(input.name);
  if (error) return { error };
  const companyId = idSchema.parse(input.companyId);

  try {
    const scenario = await prisma.$transaction(async (tx) => {
      await ensureFinancialYears(tx, companyId, YEARS_AHEAD);
      return tx.estimateScenario.create({
        data: { companyId, name: input.name.trim() },
        select: { id: true },
      });
    });
    refresh();
    return { id: scenario.id };
  } catch (error) {
    if (isUniqueConstraintError(error)) return { error: "nameTaken" };
    throw error;
  }
}

export async function renameEstimateScenario(input: {
  scenarioId: number;
  name: string;
}): Promise<{ error?: ScenarioNameError }> {
  await requireUserId();

  const error = nameError(input.name);
  if (error) return { error };

  try {
    await prisma.estimateScenario.update({
      where: { id: idSchema.parse(input.scenarioId) },
      data: { name: input.name.trim() },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return { error: "nameTaken" };
    throw error;
  }
  refresh();
  return {};
}

// Deletes the scenario with its estimates.
export async function deleteEstimateScenario(input: { scenarioId: number }): Promise<void> {
  await requireUserId();
  await prisma.estimateScenario.deleteMany({ where: { id: idSchema.parse(input.scenarioId) } });
  refresh();
}

const saveSchema = z
  .object({
    scenarioId: idSchema,
    resultFieldId: idSchema,
    reportingSeasonId: idSchema.nullish(),
    financialYearId: idSchema.nullish(),
    // Keeps the stored value well within bigint.
    value: z.number().min(-1e15).max(1e15).nullable(),
  })
  .refine((input) => (input.reportingSeasonId == null) !== (input.financialYearId == null));

// Saves a result field's estimate for a reporting season or a financial year as a new row, with
// the field's current estimate type. Value is a percent for relative estimates and euros for
// absolute ones (a percent for percent fields), stored rounded to hundredths of a percent or whole
// euros; null clears the estimate.
export async function saveEstimate(input: {
  scenarioId: number;
  resultFieldId: number;
  reportingSeasonId?: number | null;
  financialYearId?: number | null;
  value: number | null;
}): Promise<{ saved: boolean }> {
  await requireUserId();

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { saved: false };
  const { scenarioId, resultFieldId, reportingSeasonId, financialYearId, value } = parsed.data;

  // The scenario, field and period must belong to the same company.
  const scenario = await prisma.estimateScenario.findUnique({
    where: { id: scenarioId },
    select: { companyId: true },
  });
  if (!scenario) return { saved: false };
  const { companyId } = scenario;
  const [field, periods] = await Promise.all([
    prisma.resultField.findFirst({
      // Fields calculated from estimates have no estimates of their own.
      where: {
        id: resultFieldId,
        resultFieldGroup: { companyId },
        fieldDefinitions: { none: { kind: "estimate" } },
      },
      select: { estimateType: true, valueFormat: true },
    }),
    reportingSeasonId != null
      ? prisma.reportingSeason.count({ where: { id: reportingSeasonId, financialYear: { companyId } } })
      : prisma.financialYear.count({ where: { id: financialYearId!, companyId } }),
  ]);
  if (!field || periods === 0) return { saved: false };

  await prisma.estimateRow.create({
    data: {
      estimateScenarioId: scenarioId,
      resultFieldId,
      reportingSeasonId: reportingSeasonId ?? null,
      financialYearId: financialYearId ?? null,
      type: field.estimateType,
      value: value == null ? null : toStoredEstimate(field.estimateType, field.valueFormat, value),
    },
  });
  return { saved: true };
}
