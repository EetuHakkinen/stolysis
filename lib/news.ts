import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  findDocumentLinks,
  findReleaseLine,
  htmlToText,
  matchCategory,
  matchCompany,
  parseDateHeader,
  parseReleaseTime,
} from "@/lib/news-email";
import { extractResultsFromNews, isReportCategory } from "@/lib/report-extraction";

// Not server actions: these are also called by the SendGrid webhook, which has no Clerk session.
// "server-only" keeps them from being bundled into (or called from) the client.

export type NewsInput = {
  companyId: number;
  title: string;
  description: string;
  releasedAt: Date;
  categoryId: number;
  attachments: { url: string; name?: string }[];
};

export async function saveNews({ attachments, ...news }: NewsInput) {
  // Nested create keeps the news and its attachments in one transaction.
  return prisma.news.create({
    data: { ...news, attachments: { create: attachments } },
  });
}

// Category for news that match no other category.
const FALLBACK_CATEGORY = "Muu";

// Category of a news item by its subject and release line, falling back to Muu.
export async function categorizeNews({
  subject,
  releaseLine,
}: {
  subject: string;
  releaseLine?: string;
}): Promise<{ id: number; name: string }> {
  const categories = await prisma.newsCategory.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true, keywords: true },
  });
  const category =
    matchCategory(categories, { subject, releaseLine }) ??
    categories.find((category) => category.name === FALLBACK_CATEGORY);
  if (!category) throw new Error(`News category "${FALLBACK_CATEGORY}" is missing`);
  return { id: category.id, name: category.name };
}

export type NewsEmail = {
  subject?: string;
  text?: string;
  html?: string;
  headers?: string;
};

export type SaveNewsResult =
  | { saved: true; newsId: number; companyId: number; category: string }
  | { saved: false; reason: "noSubject" | "noCompany" | "noReleaseTime" };

// Saves a stock exchange release email as news for the company it mentions.
export async function saveNewsFromEmail(email: NewsEmail): Promise<SaveNewsResult> {
  const description = (email.text?.trim() || htmlToText(email.html ?? "")).trim();
  return saveRelease({
    title: email.subject,
    description,
    fallbackReleasedAt: parseDateHeader(email.headers ?? ""),
    attachments: findDocumentLinks(description, email.html),
  });
}

// Saves a stock exchange release as news for the company it mentions. The release time is read
// from the release line in the description, or failing that is `fallbackReleasedAt`.
export async function saveRelease({
  title: rawTitle,
  description,
  fallbackReleasedAt,
  attachments,
}: {
  title?: string;
  description: string;
  fallbackReleasedAt?: Date;
  attachments: { url: string; name?: string }[];
}): Promise<SaveNewsResult> {
  const title = rawTitle?.trim();
  if (!title) return { saved: false, reason: "noSubject" };

  const companies = await prisma.company.findMany({
    select: { id: true, name: true, ticker: true },
  });
  const company = matchCompany(companies, { subject: title, text: description });
  if (!company) return { saved: false, reason: "noCompany" };

  const releasedAt = parseReleaseTime(description) ?? fallbackReleasedAt;
  if (!releasedAt) return { saved: false, reason: "noReleaseTime" };

  const category = await categorizeNews({
    subject: title,
    releaseLine: findReleaseLine(description),
  });

  const news = await saveNews({
    companyId: company.id,
    title,
    description,
    releasedAt,
    categoryId: category.id,
    attachments,
  });
  return { saved: true, newsId: news.id, companyId: company.id, category: category.name };
}

// Extracts results from saved report news after the response is sent: reading a report takes a
// while. Other news have no results to extract.
export function extractResultsAfterResponse(result: SaveNewsResult) {
  if (!result.saved || !isReportCategory(result.category)) return;
  const { newsId } = result;
  after(async () => {
    try {
      const extraction = await extractResultsFromNews(newsId);
      console.log("Extracted results from news", { newsId, ...extraction });
    } catch (error) {
      console.error("Extracting results from news failed", { newsId, error });
    }
  });
}
