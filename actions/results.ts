"use server";

import type { Unit } from "@/app/generated/prisma/client";
import { requireUserId } from "@/lib/auth";
import { loadResultGroups, resultGroupsAsOf, type ResultGroup } from "@/lib/company-data";
import { prisma } from "@/lib/prisma";

export type ResultSeason = {
  id: number;
  name: string | null;
  financialYear: { id: number; name: string | null; unit: Unit | null };
};

export type { ResultGroup };

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
    loadResultGroups(companyId),
  ]);

  return { seasons, groups: resultGroupsAsOf(groups) };
}
