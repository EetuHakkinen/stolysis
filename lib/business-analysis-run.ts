import "server-only";
import { after } from "next/server";
import type { BusinessAnalysisRunStatus } from "@/app/generated/prisma/enums";
import { analyzeNewsForBusiness, BACKFILL_ANALYZED_NEWS_CATEGORIES } from "@/lib/business-analysis";
import { prisma } from "@/lib/prisma";

// A running run not updated for this long was interrupted, e.g. by a server restart: analyzing one
// news item takes at most a few minutes.
const STALE_AFTER_MS = 15 * 60 * 1000;

export type BusinessAnalysisRunState = {
  status: BusinessAnalysisRunStatus | "interrupted";
  newsCount: number;
  processedCount: number;
  failedCount: number;
  createdAt: Date;
};

// The company's latest run, or null when there is none.
export async function latestBusinessAnalysisRun(companyId: number): Promise<BusinessAnalysisRunState | null> {
  const run = await prisma.businessAnalysisRun.findFirst({
    where: { companyId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { status: true, newsCount: true, processedCount: true, failedCount: true, createdAt: true, updatedAt: true },
  });
  if (!run) return null;
  const { updatedAt, ...state } = run;
  const interrupted = state.status === "running" && Date.now() - updatedAt.getTime() > STALE_AFTER_MS;
  return { ...state, status: interrupted ? "interrupted" : state.status };
}

// The company's past news that a run would go through: reports not yet gone through for the business
// analysis, oldest first.
function pendingNewsWhere(companyId: number) {
  return {
    companyId,
    businessAnalyzedAt: null,
    category: { name: { in: BACKFILL_ANALYZED_NEWS_CATEGORIES } },
  };
}

// How many of the company's past news a run would go through.
export async function countPendingAnalysisNews(companyId: number): Promise<number> {
  return prisma.news.count({ where: pendingNewsWhere(companyId) });
}

export type StartBusinessAnalysisRunResult = { started: true } | { started: false; reason: "running" | "noNews" };

// Starts going through the company's report news not yet gone through for the business analysis,
// oldest first so that each update builds on the earlier ones, after the response is sent. Only one
// run per company runs at a time.
export async function startBusinessAnalysisRun(companyId: number): Promise<StartBusinessAnalysisRunResult> {
  if ((await latestBusinessAnalysisRun(companyId))?.status === "running") return { started: false, reason: "running" };

  const news = await prisma.news.findMany({
    where: pendingNewsWhere(companyId),
    orderBy: [{ releasedAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (news.length === 0) return { started: false, reason: "noNews" };

  const run = await prisma.businessAnalysisRun.create({
    data: { companyId, newsCount: news.length },
    select: { id: true },
  });
  after(() =>
    runBusinessAnalysis(
      run.id,
      news.map((item) => item.id),
    ),
  );
  return { started: true };
}

// Goes through the news one at a time, saving progress after each. A failed news item is counted
// and skipped, and stays to be gone through by a later run; the run fails only when saving the
// progress fails.
async function runBusinessAnalysis(runId: number, newsIds: number[]) {
  try {
    for (const newsId of newsIds) {
      let failed = false;
      try {
        const analysis = await analyzeNewsForBusiness(newsId, BACKFILL_ANALYZED_NEWS_CATEGORIES);
        console.log("Analyzed news for the business analysis", { runId, newsId, ...analysis });
      } catch (error) {
        failed = true;
        console.error("Analyzing news for the business analysis failed", { runId, newsId, error });
      }
      await prisma.businessAnalysisRun.update({
        where: { id: runId },
        data: { processedCount: { increment: 1 }, failedCount: { increment: failed ? 1 : 0 } },
      });
    }
    await prisma.businessAnalysisRun.update({ where: { id: runId }, data: { status: "done" } });
  } catch (error) {
    console.error("Business analysis run failed", { runId, error });
    await prisma.businessAnalysisRun
      .update({ where: { id: runId }, data: { status: "failed" } })
      .catch((updateError) => console.error("Marking business analysis run failed failed", { runId, updateError }));
  }
}
