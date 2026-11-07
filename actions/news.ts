"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { extractResultsAfterResponse } from "@/lib/news";
import { saveNewsFromUrl, type SaveNewsUrlResult } from "@/lib/news-url";
import { MAX_NEWS_URLS } from "@/lib/news-urls";
import { prisma } from "@/lib/prisma";

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
        extractResultsAfterResponse(result);
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

function preview(description: string): string {
  const text = description.replace(/\s+/g, " ").trim();
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH).trimEnd()}…` : text;
}
