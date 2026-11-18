"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { BusinessAnalysisCategory } from "@/app/generated/prisma/enums";
import { requireUserId } from "@/lib/auth";
import { saveSectionByHand, type SaveSectionResult } from "@/lib/business-analysis";
import {
  countPendingAnalysisNews,
  latestBusinessAnalysisRun,
  startBusinessAnalysisRun as start,
  type BusinessAnalysisRunState,
  type StartBusinessAnalysisRunResult,
} from "@/lib/business-analysis-run";
import { analysisChanges, BUSINESS_ANALYSIS_CATEGORIES, currentSections } from "@/lib/business-analysis-sections";
import { prisma } from "@/lib/prisma";

const idSchema = z.number().int().positive();
const categorySchema = z.enum(BUSINESS_ANALYSIS_CATEGORIES);

// Long enough for any section; keeps a pasted document from being saved as one.
const MAX_CONTENT_LENGTH = 50_000;

// A version of a section of a company's business analysis, with the news it was written from, or
// null when it was written by hand.
export type BusinessAnalysisVersion = {
  id: number;
  category: BusinessAnalysisCategory;
  content: string;
  createdAt: Date;
  news: { id: number; title: string } | null;
};

const versionSelect = {
  id: true,
  category: true,
  content: true,
  newsId: true,
  createdAt: true,
  news: { select: { id: true, title: true } },
} as const;

// The current version of each section of the company's business analysis, in display order.
// Sections without versions are left out.
export async function getBusinessAnalysis(input: { companyId: number }): Promise<BusinessAnalysisVersion[]> {
  await requireUserId();
  const rows = await prisma.businessAnalysis.findMany({
    where: { companyId: idSchema.parse(input.companyId) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: versionSelect,
  });
  const current = currentSections(rows);
  return BUSINESS_ANALYSIS_CATEGORIES.flatMap((category) => {
    const version = current.get(category);
    return version ? [toVersion(version)] : [];
  });
}

// A change to the business analysis: the sections one news item updated, or a section edited by
// hand, each with its text before and after.
export type BusinessAnalysisChange = {
  key: string;
  createdAt: Date;
  // Null for an edit by hand.
  news: { id: number; title: string } | null;
  changes: { category: BusinessAnalysisCategory; before: string; after: string }[];
};

// All changes to the company's business analysis, newest first.
export async function getBusinessAnalysisHistory(input: { companyId: number }): Promise<BusinessAnalysisChange[]> {
  await requireUserId();
  const rows = await prisma.businessAnalysis.findMany({
    where: { companyId: idSchema.parse(input.companyId) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: versionSelect,
  });
  return analysisChanges(rows).map(({ key, first, changes }) => ({
    key,
    createdAt: first.createdAt,
    news: first.news,
    changes,
  }));
}

// Categories of the sections of the business analysis that got a new version from the news item.
export async function getNewsBusinessAnalysis(input: { newsId: number }): Promise<BusinessAnalysisCategory[]> {
  await requireUserId();
  const rows = await prisma.businessAnalysis.findMany({
    where: { newsId: idSchema.parse(input.newsId) },
    distinct: ["category"],
    select: { category: true },
  });
  const categories = new Set(rows.map((row) => row.category));
  return BUSINESS_ANALYSIS_CATEGORIES.filter((category) => categories.has(category));
}

// Saves a section of the company's business analysis written by hand as its new version. `baseId` is
// the version that was edited, or null when the section had none: when the section got a new
// version meanwhile, nothing is saved.
export async function saveBusinessAnalysis(input: {
  companyId: number;
  category: BusinessAnalysisCategory;
  content: string;
  baseId: number | null;
}): Promise<SaveSectionResult> {
  await requireUserId();

  // Parameters come from the client, so validate them despite the type.
  const parsed = z
    .object({
      companyId: idSchema,
      category: categorySchema,
      content: z.string().max(MAX_CONTENT_LENGTH),
      baseId: idSchema.nullable(),
    })
    .parse(input);
  const result = await saveSectionByHand(parsed);
  if (result.saved) refresh();
  return result;
}

export type BusinessAnalysisRunInfo = {
  run: BusinessAnalysisRunState | null;
  // Past report news not yet gone through for the business analysis.
  pendingCount: number;
};

// The company's latest run going through its past news for the business analysis, and how many news
// a new run would go through.
export async function getBusinessAnalysisRun(input: { companyId: number }): Promise<BusinessAnalysisRunInfo> {
  await requireUserId();
  const companyId = idSchema.parse(input.companyId);
  const [run, pendingCount] = await Promise.all([
    latestBusinessAnalysisRun(companyId),
    countPendingAnalysisNews(companyId),
  ]);
  return { run, pendingCount };
}

// Starts going through the company's past report news not yet gone through for the business analysis.
export async function startBusinessAnalysisRun(input: { companyId: number }): Promise<StartBusinessAnalysisRunResult> {
  await requireUserId();
  return start(idSchema.parse(input.companyId));
}

function toVersion({ id, category, content, createdAt, news }: BusinessAnalysisVersion): BusinessAnalysisVersion {
  return { id, category, content, createdAt, news };
}
