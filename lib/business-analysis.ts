import "server-only";
import { z } from "zod";
import type { BusinessAnalysisCategory } from "@/app/generated/prisma/enums";
import type { Prisma } from "@/app/generated/prisma/client";
import { downloadDocument, type Attachment, type AttachmentDocument } from "@/lib/attachments";
import {
  analysisForPrompt,
  BUSINESS_ANALYSIS_CATEGORIES,
  currentSections,
  newVersions,
  sameVersions,
  type SectionVersion,
} from "@/lib/business-analysis-sections";
import { COMPANY_RELEASE_CATEGORY, INVESTOR_CALL_CATEGORY } from "@/lib/news-categories";
import { structuredCompletion, type ContentPart } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import { INTERIM_CATEGORY, REPORT_CATEGORIES, STATEMENTS_CATEGORY } from "@/lib/report-extraction";

// A company's business analysis describes its business and operating model for investors. It's
// updated with AI from the company's news: first the facts about the business are read from a news
// item and its attachments, then the current analysis is updated with them.

// Categories of news gone through for the business analysis when they are received.
export const ANALYZED_NEWS_CATEGORIES = [
  INTERIM_CATEGORY,
  STATEMENTS_CATEGORY,
  INVESTOR_CALL_CATEGORY,
  COMPANY_RELEASE_CATEGORY,
];

// Categories of past news gone through for the business analysis, e.g. when a company's news are
// fetched for the first time: only reports, which describe the business best.
export const BACKFILL_ANALYZED_NEWS_CATEGORIES = REPORT_CATEGORIES;

// At most this many attachments are read, and at most this many bytes of them in total.
const MAX_DOCUMENTS = 10;
const MAX_DOCUMENT_BYTES = 30 * 1024 * 1024;

// The analysis is updated again from the facts when another update was saved while the AI wrote
// this one, at most this many times in all.
const MAX_UPDATE_ATTEMPTS = 3;

// First key of the advisory lock that serializes saving a company's business analysis; the second
// key is the company id.
const LOCK_KEY = 4_317;

const SECTIONS: Record<BusinessAnalysisCategory, string> = {
  company_description:
    "Yhtiön kuvaus (company description): what the company is and does, its size (e.g. revenue and personnel), main locations and, briefly, its history and major owners.",
  business_model:
    "Liiketoimintamalli (business model): how the company makes money: its revenue streams and their nature (e.g. recurring, project or transaction based), customers, pricing, cost structure, value chain, and capital intensity.",
  products:
    "Tuotteet ja palvelut (products and services): the main products, services, brands and segments, and their significance to the company.",
  markets_and_competitors:
    "Markkinat ja kilpailijat (markets and competitors): the markets and geographies, their size, growth drivers and cyclicality, the company's market position and its main competitors.",
  strategy:
    "Strategia (strategy): the strategy, strategic priorities, long-term financial targets, and capital allocation such as the dividend policy.",
  acquisitions:
    "Yritysostot (acquisitions): acquisitions and divestments that have shaped the company, and the role of acquisitions in its strategy. Only when relevant to the company.",
  risks: "Riskit (risks): the main risks of the business and of investing in the company.",
};

const sectionList = BUSINESS_ANALYSIS_CATEGORIES.map((category) => `- ${category}: ${SECTIONS[category]}`).join("\n");

const FACTS_INSTRUCTIONS = `You read a news item of a Finnish listed company, with its attachments, and pick out the facts it tells about the company's business and operating model. The facts are used to keep up a business analysis: an overview of the company for investors.

Pick only facts that describe the company in a lasting way, for example what it sells and to whom, how it makes money, its markets and competitors, its strategy and long-term financial targets, significant acquisitions or divestments, or the main risks of the business. Leave out short-term matters: a period's figures and their changes, the outlook or guidance for the current year, order intake, share price, trading in shares, and changes in personnel or management, unless they reveal something lasting, such as a new segment structure, entering a new market or new long-term targets.

Write each fact as a concise, self-contained statement in Finnish, under the section it belongs to. Use only what the news and its attachments say. Return an empty list if the news tells nothing lasting about the business.

Sections:
${sectionList}`;

const UPDATE_INSTRUCTIONS = `You keep up the business analysis of a Finnish listed company: an overview of its business and operating model for investors. It's not for following the company's short-term progress, so it doesn't comment on a period's figures, the current year's outlook or other short-term matters.

You get the current analysis, a section per category, and facts read from a new news item of the company. Update the analysis with the facts:
- Return an update only for the sections whose text changes. Leave out a section when the facts add nothing to it or it already says the same.
- Each update is the section's whole new text, not only the change. Merge the facts into the text instead of appending them, and remove or rewrite what the facts show is outdated, so that the section reads as a coherent, current overview.
- Write in Finnish, as markdown: paragraphs and bullet lists, no headings for the section itself. Keep each section concise, at most a few paragraphs or a short list.
- Only write about acquisitions when they are relevant to the company.
- The analysis may already include information from news newer than this one. Don't replace newer information with older.
- Sections marked written_by_hand were written by the user. Keep their content and wording, only adding new facts and changing what the facts clearly contradict.

Sections:
${sectionList}`;

const categorySchema = z.enum(BUSINESS_ANALYSIS_CATEGORIES);

const factsSchema = z.object({
  facts: z.array(z.object({ category: categorySchema, fact: z.string() })),
});

const updatesSchema = z.object({
  updates: z.array(z.object({ category: categorySchema, content: z.string().describe("The section's whole new text") })),
});

export type BusinessAnalysisResult =
  // Categories whose sections got a new version; empty when the news had nothing to add.
  | { analyzed: true; categories: BusinessAnalysisCategory[] }
  | { analyzed: false; reason: "notFound" | "notAnalyzedCategory" | "alreadyAnalyzed" };

// Goes through a news item in the given categories for the company's business analysis, unless it
// has been already: reads the facts about the business from the news and all of its attachments,
// and when there are any, saves the sections they change as new versions linked to the news. The
// news is marked gone through also when it has nothing to add, but not when this fails.
export async function analyzeNewsForBusiness(
  newsId: number,
  categories: string[] = ANALYZED_NEWS_CATEGORIES,
): Promise<BusinessAnalysisResult> {
  const news = await prisma.news.findUnique({
    where: { id: newsId },
    select: {
      companyId: true,
      title: true,
      description: true,
      releasedAt: true,
      businessAnalyzedAt: true,
      category: { select: { name: true } },
      company: { select: { name: true } },
      attachments: { orderBy: { id: "asc" }, select: { url: true, name: true } },
    },
  });
  if (!news) return { analyzed: false, reason: "notFound" };
  if (news.businessAnalyzedAt) return { analyzed: false, reason: "alreadyAnalyzed" };
  if (!categories.includes(news.category.name)) return { analyzed: false, reason: "notAnalyzedCategory" };

  const documents = await downloadDocuments(news.attachments);
  const newsContent: ContentPart[] = [
    {
      type: "text",
      text: [
        `Company: ${news.company.name}`,
        `Released: ${news.releasedAt.toISOString()}`,
        `Category: ${news.category.name}`,
        `Title: ${news.title}`,
        "",
        news.description,
      ].join("\n"),
    },
    ...documents.map(documentPart),
  ];
  const { facts } = await structuredCompletion({
    schemaName: "business_facts",
    schema: factsSchema,
    messages: [
      { role: "system", content: FACTS_INSTRUCTIONS },
      { role: "user", content: newsContent },
    ],
  });
  const factList = facts.map((fact) => ({ ...fact, fact: fact.fact.trim() })).filter((fact) => fact.fact);
  if (factList.length === 0) {
    const marked = await markAnalyzed(prisma, newsId);
    return marked ? { analyzed: true, categories: [] } : { analyzed: false, reason: "alreadyAnalyzed" };
  }

  const factText = BUSINESS_ANALYSIS_CATEGORIES.flatMap((category) => {
    const sectionFacts = factList.filter((fact) => fact.category === category);
    return sectionFacts.length > 0
      ? [`${category}:`, ...sectionFacts.map((fact) => `- ${fact.fact}`), ""]
      : [];
  }).join("\n");

  for (let attempt = 1; attempt <= MAX_UPDATE_ATTEMPTS; attempt++) {
    const current = await readCurrentSections(prisma, news.companyId);
    const { updates } = await structuredCompletion({
      schemaName: "business_analysis_updates",
      schema: updatesSchema,
      messages: [
        { role: "system", content: UPDATE_INSTRUCTIONS },
        {
          role: "user",
          content: [
            `Company: ${news.company.name}`,
            "",
            "Current analysis:",
            analysisForPrompt(current),
            "",
            `Facts from the news "${news.title}", released ${news.releasedAt.toISOString()}:`,
            factText,
          ].join("\n"),
        },
      ],
    });
    const versions = newVersions(current, updates);

    const outcome = await prisma.$transaction(async (tx) => {
      await lockAnalysis(tx, news.companyId);
      if (!sameVersions(current, await readCurrentSections(tx, news.companyId))) return "changed" as const;
      if (!(await markAnalyzed(tx, newsId))) return "alreadyAnalyzed" as const;
      // business_analysis is insert-only, so new versions are new rows.
      await tx.businessAnalysis.createMany({
        data: versions.map((version) => ({ companyId: news.companyId, newsId, ...version })),
      });
      return "saved" as const;
    });
    if (outcome === "saved") return { analyzed: true, categories: versions.map((version) => version.category) };
    if (outcome === "alreadyAnalyzed") return { analyzed: false, reason: "alreadyAnalyzed" };
  }
  throw new Error(`Business analysis changed during each of ${MAX_UPDATE_ATTEMPTS} updates`);
}

export type SaveSectionResult = { saved: true } | { saved: false; reason: "empty" | "unchanged" | "changed" };

// Saves a section written by hand as its new version, unless it's empty or the same as the current
// one, or the section got a new version after `baseId` (the version edited, or null for none).
export async function saveSectionByHand({
  companyId,
  category,
  content: rawContent,
  baseId,
}: {
  companyId: number;
  category: BusinessAnalysisCategory;
  content: string;
  baseId: number | null;
}): Promise<SaveSectionResult> {
  const content = rawContent.trim();
  if (!content) return { saved: false, reason: "empty" };
  return prisma.$transaction(async (tx) => {
    await lockAnalysis(tx, companyId);
    const current = (await readCurrentSections(tx, companyId)).get(category);
    if ((current?.id ?? null) !== baseId) return { saved: false, reason: "changed" } as const;
    if (current?.content.trim() === content) return { saved: false, reason: "unchanged" } as const;
    // business_analysis is insert-only, so the new version is a new row.
    await tx.businessAnalysis.create({ data: { companyId, category, content, newsId: null } });
    return { saved: true } as const;
  });
}

type Db = Prisma.TransactionClient | typeof prisma;

// The current version of each of the company's sections.
async function readCurrentSections(db: Db, companyId: number): Promise<Map<BusinessAnalysisCategory, SectionVersion>> {
  return currentSections(
    await db.businessAnalysis.findMany({
      where: { companyId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, category: true, content: true, newsId: true },
    }),
  );
}

// Holds saves of the company's business analysis until the transaction ends, so a save can check
// that the sections haven't changed since they were read.
async function lockAnalysis(tx: Prisma.TransactionClient, companyId: number) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEY}::int, ${companyId}::int)`;
}

// Marks the news gone through for the business analysis; false when it was already.
async function markAnalyzed(db: Db, newsId: number): Promise<boolean> {
  const { count } = await db.news.updateMany({
    where: { id: newsId, businessAnalyzedAt: null },
    data: { businessAnalyzedAt: new Date() },
  });
  return count > 0;
}

// The attachments that are PDFs or text, in order, up to the limits. Attachments over the limits
// are left out, as are those that can't be downloaded.
async function downloadDocuments(attachments: Attachment[]): Promise<AttachmentDocument[]> {
  const documents: AttachmentDocument[] = [];
  let bytes = 0;
  for (const attachment of attachments) {
    if (documents.length >= MAX_DOCUMENTS) {
      console.warn("Too many attachments for the business analysis", { url: attachment.url });
      continue;
    }
    let document: AttachmentDocument | undefined;
    try {
      document = await downloadDocument(attachment);
    } catch (error) {
      console.warn("Attachment download failed", { url: attachment.url, error });
    }
    if (!document) continue;
    if (bytes + document.bytes > MAX_DOCUMENT_BYTES) {
      console.warn("Attachments too large for the business analysis", { url: attachment.url, bytes: document.bytes });
      continue;
    }
    bytes += document.bytes;
    documents.push(document);
  }
  return documents;
}

function documentPart(document: AttachmentDocument): ContentPart {
  return document.kind === "pdf"
    ? { type: "file", file: { filename: document.name, file_data: document.fileData } }
    : { type: "text", text: `Attachment "${document.name}":\n\n${document.text}` };
}
