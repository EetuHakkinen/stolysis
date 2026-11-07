"use server";

import { requireUserId } from "@/lib/auth";
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
      attachments: { orderBy: { id: "asc" } },
    },
  });
}

function preview(description: string): string {
  const text = description.replace(/\s+/g, " ").trim();
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH).trimEnd()}…` : text;
}
