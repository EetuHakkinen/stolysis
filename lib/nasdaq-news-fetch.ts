import "server-only";
import { after } from "next/server";
import type { NewsFetchStatus } from "@/app/generated/prisma/enums";
import { ANALYZED_NEWS_CATEGORIES, BACKFILL_ANALYZED_NEWS_CATEGORIES } from "@/lib/business-analysis";
import { fetchAnnouncements, fetchIssuers, fetchReleaseText, type NasdaqAnnouncement } from "@/lib/nasdaq";
import {
  DUPLICATE_WINDOW_MS,
  matchExistingNews,
  matchIssuer,
  needsNewsFetch,
  newsFetchStart,
  withoutTranslations,
} from "@/lib/nasdaq-news";
import { analyzeNewsAndLog, categorizeNews, saveNews, writePeriodNoteAndLog } from "@/lib/news";
import { findReleaseLine } from "@/lib/news-email";
import { prisma } from "@/lib/prisma";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { extractResultsFromNews, isReportCategory } from "@/lib/report-extraction";

// Release pages fetched at the same time.
const TEXT_CONCURRENCY = 3;

// A running fetch not updated for this long was interrupted, e.g. by a server restart: saving a
// batch of news takes seconds, and reading one report, analyzing one news item or writing one note
// at most a few minutes.
const STALE_AFTER_MS = 15 * 60 * 1000;

export type NewsFetchState = {
  status: NewsFetchStatus | "interrupted";
  newsCount: number;
  processedCount: number;
  reportCount: number;
  extractedCount: number;
  analysisCount: number;
  analyzedCount: number;
  periodCount: number;
  periodReviewedCount: number;
};

// The company's latest fetch that found news to save, or null when there is none.
export async function latestNewsFetch(companyId: number): Promise<NewsFetchState | null> {
  const fetch = await prisma.newsFetch.findFirst({
    where: { companyId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      status: true,
      newsCount: true,
      processedCount: true,
      reportCount: true,
      extractedCount: true,
      analysisCount: true,
      analyzedCount: true,
      periodCount: true,
      periodReviewedCount: true,
      updatedAt: true,
    },
  });
  if (!fetch) return null;
  const { updatedAt, ...state } = fetch;
  const interrupted = state.status === "running" && Date.now() - updatedAt.getTime() > STALE_AFTER_MS;
  return { ...state, status: interrupted ? "interrupted" : state.status };
}

export type NewsFetchResult =
  | { fetched: false; reason: "noIssuer" | "notStale" | "running" }
  | {
      fetched: true;
      // News saved, including those paired with news received by email.
      savedCount: number;
      // The fetch's progress, when it found news to save.
      fetchId: number | null;
      // Saved report news to extract results from, oldest first.
      reportNewsIds: number[];
      // Saved news to go through for the business analysis, oldest first.
      analysisNewsIds: number[];
      // Saved reports to write period notes on, oldest first.
      periodNewsIds: number[];
    };

// When the company has a Nasdaq issuer, no fetch of its news is running and its news haven't been
// checked in 4 hours (or always with `force`), fetches its announcements since the latest news
// fetched from Nasdaq (5 years back when there are none) and saves them as news. The fetch time is
// saved before fetching, so a page opened during the fetch doesn't fetch again. The saved news are
// processed with processFetchedNews. Throws a NasdaqError when fetching fails.
export async function refreshStaleNews(
  companyId: number,
  { force = false }: { force?: boolean } = {},
): Promise<NewsFetchResult> {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { nasdaqName: true, newsFetchedAt: true },
  });
  const now = new Date();
  if (!company.nasdaqName) return { fetched: false, reason: "noIssuer" };
  if (!force && !needsNewsFetch({ fetchedAt: company.newsFetchedAt, now })) {
    return { fetched: false, reason: "notStale" };
  }
  if ((await latestNewsFetch(companyId))?.status === "running") return { fetched: false, reason: "running" };

  await prisma.company.update({ where: { id: companyId }, data: { newsFetchedAt: now } });
  return fetchNasdaqNews(companyId, company.nasdaqName, now);
}

// Processes the fetch's saved news one at a time, oldest first, saving the progress after each, and
// then marks the fetch done: first extracts results from the reports, so that newer reports win,
// then goes through the news for the business analysis, as each update builds on the previous ones,
// and then writes notes on the reports' periods, which use both. A failed news item is logged and
// skipped.
export async function processFetchedNews(
  fetchId: number,
  {
    reportNewsIds,
    analysisNewsIds,
    periodNewsIds,
  }: { reportNewsIds: number[]; analysisNewsIds: number[]; periodNewsIds: number[] },
) {
  try {
    for (const newsId of reportNewsIds) {
      try {
        const extraction = await extractResultsFromNews(newsId);
        console.log("Extracted results from news", { newsId, ...extraction });
      } catch (error) {
        console.error("Extracting results from news failed", { newsId, error });
      }
      await prisma.newsFetch.update({ where: { id: fetchId }, data: { extractedCount: { increment: 1 } } });
    }
    for (const newsId of analysisNewsIds) {
      await analyzeNewsAndLog(newsId);
      await prisma.newsFetch.update({ where: { id: fetchId }, data: { analyzedCount: { increment: 1 } } });
    }
    for (const newsId of periodNewsIds) {
      await writePeriodNoteAndLog(newsId);
      await prisma.newsFetch.update({ where: { id: fetchId }, data: { periodReviewedCount: { increment: 1 } } });
    }
    await prisma.newsFetch.update({ where: { id: fetchId }, data: { status: "done" } });
  } catch (error) {
    console.error("Extracting results of fetched news failed", { fetchId, error });
    await markFailed(fetchId);
  }
}

// Sets the company's Nasdaq issuer by its name when it has none, then fetches its news (5 years
// back) and processes them after the response is sent, for a new company.
export function startNewsBackfill(companyId: number) {
  after(async () => {
    try {
      await matchCompanyIssuer(companyId);
      const result = await refreshStaleNews(companyId, { force: true });
      if (result.fetched && result.fetchId !== null) await processFetchedNews(result.fetchId, result);
    } catch (error) {
      console.error("Fetching news of new company failed", { companyId, error });
    }
  });
}

// Sets the Nasdaq issuer whose name matches the company's (see matchIssuer) when it has none.
async function matchCompanyIssuer(companyId: number) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { name: true, nasdaqName: true },
  });
  if (company.nasdaqName) return;
  const issuer = matchIssuer(company.name, await fetchIssuers());
  if (!issuer) {
    console.warn("No Nasdaq issuer matches company", { companyId, name: company.name });
    return;
  }
  await prisma.company.update({ where: { id: companyId }, data: { nasdaqName: issuer } });
}

// Saves the issuer's announcements since the latest news fetched from Nasdaq as the company's
// news, oldest first: when fetching stops halfway, the next fetch continues from where it stopped.
// Announcements that are news already received by email or by URL only get their Nasdaq id. The
// progress is saved after each batch of news. The first fetch of a company's news, going years back,
// only takes reports to the business analysis and writes no period notes; later fetches take news of
// all analyzed categories and write notes on the reports' periods.
async function fetchNasdaqNews(companyId: number, issuer: string, now: Date): Promise<NewsFetchResult> {
  const latest = await prisma.news.findFirst({
    where: { companyId, nasdaqId: { not: null } },
    orderBy: { releasedAt: "desc" },
    select: { releasedAt: true },
  });
  const since = newsFetchStart(latest?.releasedAt ?? null, now);

  // Finnish versions, or English ones of releases published only in English. Translations are
  // left out before the saved news, so that the English version of a saved release isn't saved.
  const fetched = withoutTranslations(await fetchAnnouncements({ issuer, language: "fi", since }));
  const known = new Set(
    (
      await prisma.news.findMany({
        where: { nasdaqId: { in: fetched.map((announcement) => announcement.id) } },
        select: { nasdaqId: true },
      })
    ).map((news) => news.nasdaqId),
  );
  const announcements = fetched
    .filter((announcement) => !known.has(announcement.id))
    .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime() || a.id - b.id);
  if (announcements.length === 0) {
    return { fetched: true, savedCount: 0, fetchId: null, reportNewsIds: [], analysisNewsIds: [], periodNewsIds: [] };
  }
  const analyzedCategories = latest ? ANALYZED_NEWS_CATEGORIES : BACKFILL_ANALYZED_NEWS_CATEGORIES;

  const { id: fetchId } = await prisma.newsFetch.create({
    data: { companyId, newsCount: announcements.length },
    select: { id: true },
  });
  try {
    const pairs = await pairWithExistingNews(companyId, issuer, announcements);
    let savedCount = 0;
    const reportNewsIds: number[] = [];
    const analysisNewsIds: number[] = [];
    for (let i = 0; i < announcements.length; i += TEXT_CONCURRENCY) {
      const batch = announcements.slice(i, i + TEXT_CONCURRENCY);
      const texts = await Promise.all(
        batch.map((announcement) =>
          pairs.has(announcement.id) ? undefined : fetchReleaseText(announcement.messageUrl),
        ),
      );
      // Saved in order after the batch is fetched, so a failed fetch leaves no gap behind.
      for (const [j, announcement] of batch.entries()) {
        const newsId = pairs.get(announcement.id);
        if (newsId !== undefined) {
          if (await setNasdaqId(newsId, announcement.id)) savedCount++;
          continue;
        }
        const saved = await saveAnnouncement(companyId, announcement, texts[j]!);
        if (!saved) continue;
        savedCount++;
        if (isReportCategory(saved.category)) reportNewsIds.push(saved.newsId);
        if (analyzedCategories.includes(saved.category)) analysisNewsIds.push(saved.newsId);
      }
      await prisma.newsFetch.update({
        where: { id: fetchId },
        data: { processedCount: { increment: batch.length } },
      });
    }
    const periodNewsIds = latest ? reportNewsIds : [];
    await prisma.newsFetch.update({
      where: { id: fetchId },
      data: {
        reportCount: reportNewsIds.length,
        analysisCount: analysisNewsIds.length,
        periodCount: periodNewsIds.length,
        ...(reportNewsIds.length === 0 && analysisNewsIds.length === 0 && { status: "done" }),
      },
    });
    console.log("Fetched news from Nasdaq", { companyId, issuer, since, savedCount, paired: pairs.size });
    return { fetched: true, savedCount, fetchId, reportNewsIds, analysisNewsIds, periodNewsIds };
  } catch (error) {
    await markFailed(fetchId);
    throw error;
  }
}

async function markFailed(fetchId: number) {
  await prisma.newsFetch
    .update({ where: { id: fetchId }, data: { status: "failed" } })
    .catch((error) => console.error("Marking news fetch failed failed", { fetchId, error }));
}

// The company's news received by email or by URL that are the same release as one of the
// announcements, by announcement id.
async function pairWithExistingNews(
  companyId: number,
  issuer: string,
  announcements: NasdaqAnnouncement[],
): Promise<Map<number, number>> {
  const from = new Date(announcements[0].publishedAt.getTime() - DUPLICATE_WINDOW_MS);
  const existing = await prisma.news.findMany({
    where: { companyId, nasdaqId: null, releasedAt: { gte: from } },
    select: { id: true, title: true, releasedAt: true },
  });
  if (existing.length === 0) return new Map();
  // News received by email may have the English title while the Finnish version is saved.
  const english = await fetchAnnouncements({ issuer, language: "en", since: from });
  return matchExistingNews(announcements, english, existing);
}

// Marks news received by email or by URL as the announcement; false when another fetch running at
// the same time saved the announcement first.
async function setNasdaqId(newsId: number, nasdaqId: number): Promise<boolean> {
  try {
    await prisma.news.update({ where: { id: newsId }, data: { nasdaqId } });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) return false;
    throw error;
  }
}

// Saves the announcement as news; undefined when another fetch running at the same time saved it
// first.
async function saveAnnouncement(companyId: number, announcement: NasdaqAnnouncement, text: string) {
  const category = await categorizeNews({ subject: announcement.headline, releaseLine: findReleaseLine(text) });
  try {
    const news = await saveNews({
      companyId,
      title: announcement.headline,
      description: text,
      releasedAt: announcement.publishedAt,
      categoryId: category.id,
      attachments: announcement.attachments,
      nasdaqId: announcement.id,
    });
    return { newsId: news.id, category: category.name };
  } catch (error) {
    if (isUniqueConstraintError(error)) return undefined;
    throw error;
  }
}
