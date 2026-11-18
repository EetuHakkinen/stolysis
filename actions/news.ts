"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { NasdaqError } from "@/lib/nasdaq";
import {
  processFetchedNews,
  latestNewsFetch,
  refreshStaleNews,
  type NewsFetchResult,
  type NewsFetchState,
} from "@/lib/nasdaq-news-fetch";
import { processNewsAfterResponse, saveInvestorCall } from "@/lib/news";
import { saveNewsFromUrl, type SaveNewsUrlResult } from "@/lib/news-url";
import { MAX_NEWS_URLS } from "@/lib/news-urls";
import { helsinkiTime } from "@/lib/helsinki-time";
import { helsinkiNoteDate, parseNoteDate } from "@/lib/note-date";
import { prisma } from "@/lib/prisma";
import type { PriceChartNews } from "@/lib/stock-price";

const NEWS_PAGE_SIZE = 100;

// Feed items only show the start of the description, so don't send the whole article.
const PREVIEW_LENGTH = 300;

export type NewsFeedItem = {
  id: number;
  title: string;
  preview: string;
  releasedAt: Date;
  company: { name: string; ticker: string };
  category: { name: string };
};

export type NewsFeedPage = {
  news: NewsFeedItem[];
  page: number;
  pageCount: number;
};

// One page of news, newest first. Without a ticker, news of all companies.
export async function getNewsFeed({
  page,
  ticker,
}: {
  page: number;
  ticker?: string;
}): Promise<NewsFeedPage> {
  await requireUserId();

  const where = ticker ? { company: { ticker } } : {};
  const total = await prisma.news.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / NEWS_PAGE_SIZE));
  // Parameters come from the client, so clamp them despite the type.
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount);

  const rows = await prisma.news.findMany({
    where,
    // id breaks ties so news released at the same time keep a stable order across pages.
    orderBy: [{ releasedAt: "desc" }, { id: "desc" }],
    skip: (current - 1) * NEWS_PAGE_SIZE,
    take: NEWS_PAGE_SIZE,
    select: {
      id: true,
      title: true,
      description: true,
      releasedAt: true,
      company: { select: { name: true, ticker: true } },
      category: { select: { name: true } },
    },
  });

  return {
    news: rows.map(({ description, ...news }) => ({
      ...news,
      preview: preview(description),
    })),
    page: current,
    pageCount,
  };
}

// All of the company's news for the stock price chart, oldest first.
export async function getPriceChartNews(input: { companyId: number }): Promise<PriceChartNews[]> {
  await requireUserId();
  const companyId = z.number().int().positive().parse(input.companyId);

  const rows = await prisma.news.findMany({
    where: { companyId },
    orderBy: [{ releasedAt: "asc" }, { id: "asc" }],
    select: { id: true, title: true, releasedAt: true },
  });
  return rows.map(({ releasedAt, ...news }) => ({ ...news, date: helsinkiNoteDate(releasedAt) }));
}

export async function getNews(id: number) {
  await requireUserId();
  if (!Number.isSafeInteger(id) || id < 1) return null;

  return prisma.news.findUnique({
    where: { id },
    include: {
      company: { select: { name: true, ticker: true } },
      category: { select: { name: true } },
      attachments: { orderBy: { id: "asc" } },
    },
  });
}

// Error values are translation keys under AddNews.errors.
export type AddNewsError =
  | "invalidUrl"
  | "failed"
  | Extract<SaveNewsUrlResult, { saved: false }>["reason"];

export type AddNewsResult = { url: string } & ({ saved: true } | { saved: false; error: AddNewsError });

const urlSchema = z.url({ protocol: /^https?$/ });

// Fetches the releases at the given URLs and saves them like news received by email.
export async function addNewsFromUrls({ urls }: { urls: string[] }): Promise<AddNewsResult[]> {
  await requireUserId();

  // Parameters come from the client, so validate them despite the type.
  if (!Array.isArray(urls) || urls.length > MAX_NEWS_URLS) return [];

  const results = await Promise.all(
    urls.map(async (input): Promise<AddNewsResult> => {
      const url = typeof input === "string" ? input.trim() : "";
      if (!urlSchema.safeParse(url).success) return { url, saved: false, error: "invalidUrl" };
      try {
        const result = await saveNewsFromUrl(url);
        if (!result.saved) return { url, saved: false, error: result.reason };
        processNewsAfterResponse(result);
        return { url, saved: true };
      } catch (error) {
        console.error("Adding news from URL failed", { url, error });
        return { url, saved: false, error: "failed" };
      }
    }),
  );

  if (results.some((result) => result.saved)) refresh();
  return results;
}

export type InvestorCallInput = {
  companyId: number | null;
  title: string;
  transcript: string;
  // Day of the call, "YYYY-MM-DD".
  date: string;
};

// Error values are translation keys under AddNews.investorCall.errors.
export type InvestorCallErrors = Partial<
  Record<"companyId" | "title" | "transcript", "required"> & { date: "invalid" | "future" }
>;

// Saves an investor call transcript as the company's news. A call today is released at the time of
// saving, an earlier one at the start of its day in Finnish time.
export async function addInvestorCall(input: InvestorCallInput): Promise<{ errors?: InvestorCallErrors }> {
  await requireUserId();

  // Parameters come from the client, so validate them despite the type.
  const companyId = z.number().int().positive().safeParse(input.companyId);
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const transcript = typeof input.transcript === "string" ? input.transcript.trim() : "";
  const date = parseNoteDate(input.date);
  const now = new Date();
  const today = helsinkiNoteDate(now);

  const errors: InvestorCallErrors = {};
  if (!companyId.success) errors.companyId = "required";
  if (!title) errors.title = "required";
  if (!transcript) errors.transcript = "required";
  if (!date) errors.date = "invalid";
  else if (input.date > today) errors.date = "future";
  if (Object.keys(errors).length > 0 || !companyId.success || !date) return { errors };

  const company = await prisma.company.findUnique({ where: { id: companyId.data }, select: { id: true } });
  if (!company) return { errors: { companyId: "required" } };

  const result = await saveInvestorCall({
    companyId: company.id,
    title,
    transcript,
    releasedAt: input.date === today ? now : helsinkiTime(date.year, date.month, date.day),
  });
  processNewsAfterResponse(result);
  refresh();
  return {};
}

// The company's latest fetch of news from Nasdaq that found news to save, or null.
export async function getNewsFetch(input: { companyId: number }): Promise<NewsFetchState | null> {
  await requireUserId();
  return latestNewsFetch(z.number().int().positive().parse(input.companyId));
}

// Fetches the company's latest news from Nasdaq when they haven't been checked in 4 hours, and
// refreshes the page when any were saved. A failed fetch is retried 4 hours later.
export async function updateNews(input: { companyId: number }): Promise<void> {
  await requireUserId();
  const companyId = z.number().int().positive().parse(input.companyId);

  try {
    afterNewsFetch(await refreshStaleNews(companyId));
  } catch (error) {
    if (!(error instanceof NasdaqError)) throw error;
    console.error(error);
  }
}

// Error values are translation keys under News.refresh.errors.
export type RefreshNewsResult = { savedCount: number } | { error: "failed" | "running" };

// Fetches the company's latest news from Nasdaq right away, also within 4 hours of the latest
// check, unless a fetch is already running.
export async function refreshNews(input: { companyId: number }): Promise<RefreshNewsResult> {
  await requireUserId();
  const companyId = z.number().int().positive().parse(input.companyId);

  try {
    const result = await refreshStaleNews(companyId, { force: true });
    afterNewsFetch(result);
    if (!result.fetched) return result.reason === "running" ? { error: "running" } : { savedCount: 0 };
    return { savedCount: result.savedCount };
  } catch (error) {
    if (!(error instanceof NasdaqError)) throw error;
    console.error(error);
    return { error: "failed" };
  }
}

// Shows the saved news, and processes them after the response is sent: extracts results from the
// reports, goes through the news for the business analysis and writes notes on the reports' periods.
function afterNewsFetch(result: NewsFetchResult) {
  if (!result.fetched) return;
  if (result.savedCount > 0) refresh();
  const { fetchId } = result;
  if (fetchId !== null && (result.reportNewsIds.length > 0 || result.analysisNewsIds.length > 0)) {
    after(() => processFetchedNews(fetchId, result));
  }
}

function preview(description: string): string {
  const text = description.replace(/\s+/g, " ").trim();
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH).trimEnd()}…` : text;
}
