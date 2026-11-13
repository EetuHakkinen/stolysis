"use server";

import type { Unit, ValueFormat } from "@/app/generated/prisma/client";
import { requireUserId } from "@/lib/auth";
import { latestRows } from "@/lib/latest-rows";
import { prisma } from "@/lib/prisma";

export type ResultSeason = {
  id: number;
  name: string | null;
  financialYear: { id: number; name: string | null; unit: Unit | null };
};

export type ResultGroup = {
  id: number;
  name: string | null;
  fields: {
    id: number;
    name: string | null;
    valueFormat: ValueFormat;
    // Value in whole euros by reporting season id; seasons without a value are missing. Empty for
    // fields calculated from actual values: their values are calculated with the estimates.
    values: Record<number, bigint | null>;
  }[];
};

export type CompanyResults = { seasons: ResultSeason[]; groups: ResultGroup[] };

// A company's result fields by group with their values, and the reporting seasons of its financial
// years that have started, oldest first. Seasons without data are estimated in the result tables.
export async function getCompanyResults(companyId: number): Promise<CompanyResults> {
  await requireUserId();

  const [seasons, groups] = await Promise.all([
    prisma.reportingSeason.findMany({
      where: { financialYear: { companyId, startTime: { lte: new Date() } } },
      orderBy: [{ financialYear: { startTime: "asc" } }, { startTime: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        financialYear: { select: { id: true, name: true, unit: true } },
      },
    }),
    prisma.resultFieldGroup.findMany({
      where: { companyId },
      orderBy: [{ order: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        resultFields: {
          orderBy: [{ order: "asc" }, { id: "asc" }],
          select: {
            id: true,
            name: true,
            valueFormat: true,
            // Rows saved before the field became calculated are ignored.
            fieldDefinitions: { where: { kind: "actual" }, select: { id: true } },
            // result_row is insert-only: newest first, so the first row per season is current.
            resultRows: {
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              select: { reportingSeasonId: true, value: true },
            },
          },
        },
      },
    }),
  ]);

  return {
    seasons,
    groups: groups.map(({ resultFields, ...group }) => ({
      ...group,
      fields: resultFields.map(({ resultRows, fieldDefinitions, ...field }) => ({
        ...field,
        values: fieldDefinitions.length > 0 ? {} : latestValues(resultRows),
      })),
    })),
  };
}

// Value of the first (latest) row per reporting season.
function latestValues(rows: { reportingSeasonId: number; value: bigint | null }[]) {
  return Object.fromEntries(
    latestRows(rows, (row) => row.reportingSeasonId).map((row) => [row.reportingSeasonId, row.value]),
  ) as Record<number, bigint | null>;
}
