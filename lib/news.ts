import "server-only";
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

// Not server actions: these are called by the SendGrid webhook, which has no Clerk session.
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
}): Promise<number> {
  const categories = await prisma.newsCategory.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true, keywords: true },
  });
  const category =
    matchCategory(categories, { subject, releaseLine }) ??
    categories.find((category) => category.name === FALLBACK_CATEGORY);
  if (!category) throw new Error(`News category "${FALLBACK_CATEGORY}" is missing`);
  return category.id;
}

export type NewsEmail = {
  subject?: string;
  text?: string;
  html?: string;
  headers?: string;
};

export type SaveNewsEmailResult =
  | { saved: true; newsId: number; companyId: number }
  | { saved: false; reason: "noSubject" | "noCompany" | "noReleaseTime" };

// Saves a stock exchange release email as news for the company it mentions.
export async function saveNewsFromEmail(email: NewsEmail): Promise<SaveNewsEmailResult> {
  const title = email.subject?.trim();
  if (!title) return { saved: false, reason: "noSubject" };

  const description = (email.text?.trim() || htmlToText(email.html ?? "")).trim();

  const companies = await prisma.company.findMany({
    select: { id: true, name: true, ticker: true },
  });
  const company = matchCompany(companies, { subject: title, text: description });
  if (!company) return { saved: false, reason: "noCompany" };

  const releasedAt = parseReleaseTime(description) ?? parseDateHeader(email.headers ?? "");
  if (!releasedAt) return { saved: false, reason: "noReleaseTime" };

  const categoryId = await categorizeNews({
    subject: title,
    releaseLine: findReleaseLine(description),
  });

  const news = await saveNews({
    companyId: company.id,
    title,
    description,
    releasedAt,
    categoryId,
    attachments: findDocumentLinks(description, email.html),
  });
  return { saved: true, newsId: news.id, companyId: company.id };
}
