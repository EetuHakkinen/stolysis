"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { Unit } from "@/app/generated/prisma/client";
import { requireUserId } from "@/lib/auth";
import { loadResultGroups, resultGroupsAsOf, type ResultGroup } from "@/lib/company-data";
import { prisma } from "@/lib/prisma";

export type ResultSeason = {
  id: number;
  name: string | null;
  // The season has ended, so its results can be edited.
  ended: boolean;
  // ended: the year has ended, so the results of its fields reported only yearly can be edited.
  financialYear: { id: number; name: string | null; unit: Unit | null; ended: boolean };
};

export type { ResultGroup };

export type CompanyResults = { seasons: ResultSeason[]; groups: ResultGroup[] };

// A company's result fields by group with their values, and the reporting seasons of its financial
// years that have started, oldest first. Seasons without data are estimated in the result tables.
export async function getCompanyResults(companyId: number): Promise<CompanyResults> {
  await requireUserId();

  const now = new Date();
  const [seasons, groups] = await Promise.all([
    prisma.reportingSeason.findMany({
      where: { financialYear: { companyId, startTime: { lte: now } } },
      orderBy: [{ financialYear: { startTime: "asc" } }, { startTime: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        endTime: true,
        financialYear: { select: { id: true, name: true, unit: true, endTime: true } },
      },
    }),
    loadResultGroups(companyId),
  ]);

  const ended = (endTime: Date | null) => endTime != null && endTime < now;
  return {
    seasons: seasons.map(({ endTime, financialYear: { endTime: yearEnd, ...year }, ...season }) => ({
      ...season,
      ended: ended(endTime),
      financialYear: { ...year, ended: ended(yearEnd) },
    })),
    groups: resultGroupsAsOf(groups),
  };
}

const saveResultsSchema = z.object({
  companyId: z.number().int().positive(),
  values: z
    .array(
      z
        .object({
          reportingSeasonId: z.number().int().positive().nullish(),
          financialYearId: z.number().int().positive().nullish(),
          resultFieldId: z.number().int().positive(),
          // Whole euros; null clears the value.
          value: z.number().int().safe().nullable(),
        })
        .refine((value) => (value.reportingSeasonId == null) !== (value.financialYearId == null)),
    )
    .min(1),
});

const unique = (ids: (number | null | undefined)[]) => [...new Set(ids.filter((id) => id != null))];

// Saves results entered by hand for ended reporting seasons, and for ended financial years of fields
// reported only yearly, as new result rows. Marks the seasons and years confirmed so values read from
// later reports don't replace them. Nothing is saved if a period hasn't ended or isn't the
// company's, or a field isn't the company's, is calculated or is reported for the other kind of
// period.
export async function saveResults(input: {
  companyId: number;
  values: {
    reportingSeasonId?: number | null;
    financialYearId?: number | null;
    resultFieldId: number;
    value: number | null;
  }[];
}): Promise<{ saved: boolean }> {
  await requireUserId();

  // Parameters come from the client, so validate them despite the type.
  const parsed = saveResultsSchema.safeParse(input);
  if (!parsed.success) return { saved: false };
  const { companyId, values } = parsed.data;
  const seasonValues = values.filter((value) => value.reportingSeasonId != null);
  const yearValues = values.filter((value) => value.financialYearId != null);
  const seasonIds = unique(seasonValues.map((value) => value.reportingSeasonId));
  const yearIds = unique(yearValues.map((value) => value.financialYearId));
  const seasonFieldIds = unique(seasonValues.map((value) => value.resultFieldId));
  const yearFieldIds = unique(yearValues.map((value) => value.resultFieldId));

  const saved = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const enteredFields = (ids: number[], yearlyOnly: boolean) =>
      tx.resultField.count({
        where: {
          id: { in: ids },
          resultFieldGroup: { companyId },
          fieldDefinitions: { none: { kind: "actual" } },
          yearlyValue: yearlyOnly ? "yearly_only" : { not: "yearly_only" },
        },
      });
    const [seasons, years, seasonFields, yearFields] = await Promise.all([
      tx.reportingSeason.count({
        where: { id: { in: seasonIds }, endTime: { lt: now }, financialYear: { companyId } },
      }),
      tx.financialYear.count({ where: { id: { in: yearIds }, endTime: { lt: now }, companyId } }),
      enteredFields(seasonFieldIds, false),
      enteredFields(yearFieldIds, true),
    ]);
    if (
      seasons !== seasonIds.length ||
      years !== yearIds.length ||
      seasonFields !== seasonFieldIds.length ||
      yearFields !== yearFieldIds.length
    )
      return false;

    // result_row is insert-only, so new values are new rows.
    await tx.resultRow.createMany({
      data: values.map((value) => ({
        reportingSeasonId: value.reportingSeasonId ?? null,
        financialYearId: value.financialYearId ?? null,
        resultFieldId: value.resultFieldId,
        value: value.value == null ? null : BigInt(value.value),
      })),
    });
    await tx.reportingSeason.updateMany({ where: { id: { in: seasonIds } }, data: { confirmed: true } });
    await tx.financialYear.updateMany({ where: { id: { in: yearIds } }, data: { confirmed: true } });
    return true;
  });

  if (saved) refresh();
  return { saved };
}
