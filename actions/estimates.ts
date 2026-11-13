"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import {
  fromStoredEstimate,
  toStoredEstimate,
  type EstimateField,
  type EstimateInput,
  type EstimateYear,
} from "@/lib/estimates";
import { ensureFinancialYears } from "@/lib/financial-year";
import { fieldFormulas } from "@/lib/formulas";
import { latestRows } from "@/lib/latest-rows";
import { prisma } from "@/lib/prisma";
import { isUniqueConstraintError } from "@/lib/prisma-errors";

// Years estimated after the current financial year.
const YEARS_AHEAD = 10;
// Years after the current one whose totals are sums of their seasons; later ones are estimated
// as a whole.
const QUARTERLY_YEARS_AHEAD = 1;

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

  const scenarios = await findScenarios(companyId);

  let years = await estimateYears(companyId);
  if (scenarios.length > 0 && (years.currentIndex < 0 || years.after < YEARS_AHEAD)) {
    await prisma.$transaction((tx) => ensureFinancialYears(tx, companyId, YEARS_AHEAD));
    years = await estimateYears(companyId);
  }

  const [fieldRows, rows] = await Promise.all([
    prisma.resultField.findMany({
      where: { resultFieldGroup: { companyId } },
      select: {
        id: true,
        estimateType: true,
        yearlyValue: true,
        valueFormat: true,
        fieldDefinitions: { select: { kind: true, definition: true } },
      },
    }),
    prisma.estimateRow.findMany({
      where: { estimateScenario: { companyId } },
      // estimate_row is insert-only: newest first, so the first row per period is current.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        estimateScenarioId: true,
        resultFieldId: true,
        reportingSeasonId: true,
        financialYearId: true,
        type: true,
        value: true,
      },
    }),
  ]);

  const fields: EstimateField[] = fieldRows.map(({ id, estimateType, yearlyValue, fieldDefinitions }) => ({
    id,
    estimateType,
    yearlyValue,
    ...fieldFormulas(fieldDefinitions),
  }));
  const valueFormats = new Map(fieldRows.map((field) => [field.id, field.valueFormat]));

  // Fields calculated from estimates have no estimates of their own; rows saved before the field
  // became calculated are ignored.
  const fieldTypes = new Map(
    fields.filter((field) => !field.estimateDefinition).map((field) => [field.id, field.estimateType]),
  );
  const current = latestRows(
    rows.filter((row) => row.type === fieldTypes.get(row.resultFieldId)),
    (row) =>
      `${row.estimateScenarioId}:${row.resultFieldId}:${row.reportingSeasonId ?? ""}:${row.financialYearId ?? ""}`,
  );
  const estimates: Record<number, EstimateInput[]> = Object.fromEntries(
    scenarios.map((scenario) => [scenario.id, []]),
  );
  for (const row of current) {
    estimates[row.estimateScenarioId].push({
      resultFieldId: row.resultFieldId,
      reportingSeasonId: row.reportingSeasonId,
      financialYearId: row.financialYearId,
      value: row.value == null ? null : fromStoredEstimate(row.type, valueFormats.get(row.resultFieldId)!, row.value),
    });
  }

  return {
    scenarios,
    years: years.years,
    currentYearId: years.years[years.currentIndex]?.id ?? null,
    fields,
    estimates,
  };
}

// A company's estimate scenarios, oldest first.
export async function getEstimateScenarios(companyId: number): Promise<EstimateScenarioSummary[]> {
  await requireUserId();
  return findScenarios(companyId);
}

function findScenarios(companyId: number) {
  return prisma.estimateScenario.findMany({
    where: { companyId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
}

// The company's financial years up to YEARS_AHEAD after the current one, with the position of the
// current one (-1 if no year covers the current day) and the number of years after it.
async function estimateYears(companyId: number) {
  const all = await prisma.financialYear.findMany({
    where: { companyId, startTime: { not: null }, endTime: { not: null } },
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      unit: true,
      startTime: true,
      endTime: true,
      reportingSeasons: {
        orderBy: [{ startTime: "asc" }, { id: "asc" }],
        select: { id: true, name: true },
      },
    },
  });

  const now = new Date();
  const currentIndex = all.findIndex((year) => year.startTime! <= now && now <= year.endTime!);
  const last = currentIndex < 0 ? all.length : currentIndex + YEARS_AHEAD + 1;
  const years = all.slice(0, last).map((year, index) => ({
    id: year.id,
    name: year.name,
    unit: year.unit,
    endTime: year.endTime!,
    seasons: year.reportingSeasons,
    fromSeasons: currentIndex < 0 || index <= currentIndex + QUARTERLY_YEARS_AHEAD,
  }));
  return { years, currentIndex, after: currentIndex < 0 ? 0 : all.length - currentIndex - 1 };
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
