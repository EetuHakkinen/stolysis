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
  financialYear: { id: number; name: string | null; unit: Unit | null };
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
        financialYear: { select: { id: true, name: true, unit: true } },
      },
    }),
    loadResultGroups(companyId),
  ]);

  return {
    seasons: seasons.map(({ endTime, ...season }) => ({ ...season, ended: endTime != null && endTime < now })),
    groups: resultGroupsAsOf(groups),
  };
}

const saveResultsSchema = z.object({
  companyId: z.number().int().positive(),
  values: z
    .array(
      z.object({
        reportingSeasonId: z.number().int().positive(),
        resultFieldId: z.number().int().positive(),
        // Whole euros; null clears the value.
        value: z.number().int().safe().nullable(),
      }),
    )
    .min(1),
});

// Saves results entered by hand for ended reporting seasons as new result rows, and marks the
// seasons confirmed so values read from later reports don't replace them. Nothing is saved if a
// season hasn't ended or isn't the company's, or a field isn't the company's or is calculated.
export async function saveResults(input: {
  companyId: number;
  values: { reportingSeasonId: number; resultFieldId: number; value: number | null }[];
}): Promise<{ saved: boolean }> {
  await requireUserId();

  // Parameters come from the client, so validate them despite the type.
  const parsed = saveResultsSchema.safeParse(input);
  if (!parsed.success) return { saved: false };
  const { companyId, values } = parsed.data;
  const seasonIds = [...new Set(values.map((value) => value.reportingSeasonId))];
  const fieldIds = [...new Set(values.map((value) => value.resultFieldId))];

  const saved = await prisma.$transaction(async (tx) => {
    const [seasons, fields] = await Promise.all([
      tx.reportingSeason.count({
        where: { id: { in: seasonIds }, endTime: { lt: new Date() }, financialYear: { companyId } },
      }),
      tx.resultField.count({
        where: {
          id: { in: fieldIds },
          resultFieldGroup: { companyId },
          fieldDefinitions: { none: { kind: "actual" } },
        },
      }),
    ]);
    if (seasons !== seasonIds.length || fields !== fieldIds.length) return false;

    // result_row is insert-only, so new values are new rows.
    await tx.resultRow.createMany({
      data: values.map((value) => ({
        reportingSeasonId: value.reportingSeasonId,
        resultFieldId: value.resultFieldId,
        value: value.value == null ? null : BigInt(value.value),
      })),
    });
    await tx.reportingSeason.updateMany({ where: { id: { in: seasonIds } }, data: { confirmed: true } });
    return true;
  });

  if (saved) refresh();
  return { saved };
}
