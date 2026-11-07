"use server";

import type { Unit } from "@/app/generated/prisma/client";
import { requireUserId } from "@/lib/auth";
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
    // Value in whole euros by reporting season id; seasons without a value are missing.
    values: Record<number, bigint | null>;
  }[];
};

export type CompanyResults = { seasons: ResultSeason[]; groups: ResultGroup[] };

// A company's result fields by group with their values, and its reporting seasons
// oldest first.
export async function getCompanyResults(companyId: number): Promise<CompanyResults> {
  await requireUserId();

  const [seasons, groups] = await Promise.all([
    prisma.reportingSeason.findMany({
      where: { financialYear: { companyId } },
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
            resultRows: { select: { reportingSeasonId: true, value: true } },
          },
        },
      },
    }),
  ]);

  return {
    seasons,
    groups: groups.map(({ resultFields, ...group }) => ({
      ...group,
      fields: resultFields.map(({ resultRows, ...field }) => ({
        ...field,
        values: Object.fromEntries(resultRows.map((row) => [row.reportingSeasonId, row.value])),
      })),
    })),
  };
}
