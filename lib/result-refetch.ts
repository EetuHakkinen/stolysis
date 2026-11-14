import "server-only";
import { after } from "next/server";
import type { ResultRefetchStatus } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { extractResultsFromNews, REPORT_CATEGORIES } from "@/lib/report-extraction";

// A running refetch not updated for this long was interrupted, e.g. by a server restart: reading
// one report takes at most a few minutes.
const STALE_AFTER_MS = 15 * 60 * 1000;

export type ResultRefetchState = {
  status: ResultRefetchStatus | "interrupted";
  fieldIds: number[];
  newsCount: number;
  processedCount: number;
  failedCount: number;
  rowCount: number;
  createdAt: Date;
};

// The company's latest refetch, or null when there is none.
export async function latestResultRefetch(companyId: number): Promise<ResultRefetchState | null> {
  const refetch = await prisma.resultRefetch.findFirst({
    where: { companyId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      status: true,
      fieldIds: true,
      newsCount: true,
      processedCount: true,
      failedCount: true,
      rowCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!refetch) return null;
  const { updatedAt, ...state } = refetch;
  const interrupted = state.status === "running" && Date.now() - updatedAt.getTime() > STALE_AFTER_MS;
  return { ...state, status: interrupted ? "interrupted" : state.status };
}

export type StartResultRefetchResult =
  | { started: true }
  | { started: false; reason: "running" | "noFields" | "noNews" };

// Starts extracting the values of the fields again from all of the company's report news, oldest
// first so that newer reports win, after the response is sent. Fields that aren't the company's or
// are calculated from actual values are ignored. Only one refetch per company runs at a time.
export async function startResultRefetch(companyId: number, fieldIds: number[]): Promise<StartResultRefetchResult> {
  const fields = await prisma.resultField.findMany({
    where: {
      id: { in: fieldIds },
      resultFieldGroup: { companyId },
      fieldDefinitions: { none: { kind: "actual" } },
    },
    select: { id: true },
  });
  if (fields.length === 0) return { started: false, reason: "noFields" };
  if ((await latestResultRefetch(companyId))?.status === "running") return { started: false, reason: "running" };

  const news = await prisma.news.findMany({
    where: { companyId, category: { name: { in: REPORT_CATEGORIES } } },
    orderBy: [{ releasedAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (news.length === 0) return { started: false, reason: "noNews" };

  const refetch = await prisma.resultRefetch.create({
    data: { companyId, fieldIds: fields.map((field) => field.id), newsCount: news.length },
    select: { id: true, fieldIds: true },
  });
  after(() =>
    runResultRefetch(
      refetch.id,
      news.map((item) => item.id),
      refetch.fieldIds,
    ),
  );
  return { started: true };
}

// Goes through the news one at a time, saving progress after each. A failed news item is counted
// and skipped; the refetch fails only when saving the progress fails.
async function runResultRefetch(refetchId: number, newsIds: number[], fieldIds: number[]) {
  try {
    for (const newsId of newsIds) {
      let rowCount = 0;
      let failed = false;
      try {
        const extraction = await extractResultsFromNews(newsId, fieldIds);
        if (extraction.saved) rowCount = extraction.rowCount;
        console.log("Refetched results from news", { refetchId, newsId, ...extraction });
      } catch (error) {
        failed = true;
        console.error("Refetching results from news failed", { refetchId, newsId, error });
      }
      await prisma.resultRefetch.update({
        where: { id: refetchId },
        data: {
          processedCount: { increment: 1 },
          failedCount: { increment: failed ? 1 : 0 },
          rowCount: { increment: rowCount },
        },
      });
    }
    await prisma.resultRefetch.update({ where: { id: refetchId }, data: { status: "done" } });
  } catch (error) {
    console.error("Result refetch failed", { refetchId, error });
    await prisma.resultRefetch
      .update({ where: { id: refetchId }, data: { status: "failed" } })
      .catch((updateError) => console.error("Marking result refetch failed failed", { refetchId, updateError }));
  }
}
