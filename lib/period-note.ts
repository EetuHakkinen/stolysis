import "server-only";
import { z } from "zod";
import { businessAnalysisForPrompt, documentPart, downloadDocuments } from "@/lib/business-analysis";
import { latestRows } from "@/lib/latest-rows";
import { fromDbDate, helsinkiNoteDate, toDbDate } from "@/lib/note-date";
import { figuresForPrompt, notesForPrompt, yearBefore, type ExtractedFigure } from "@/lib/period-note-context";
import { structuredCompletion } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import { isReportCategory } from "@/lib/report-extraction";

// Notes on the periods of a company's reports, written with AI when an interim report or financial
// statements release is received: the period's key metrics, key events and outlook, with the
// company's notes from the past year and its business analysis as context.

// The past year's notes are given to the AI up to this many characters, the newest first.
const MAX_NOTES_LENGTH = 40_000;

const INSTRUCTIONS = `You write a short note on the period of a Finnish listed company's interim report or financial statements release, for an investor who follows the company. The note is saved among the investor's own notes on the company.

Write in Finnish, as markdown, with exactly these sections and no title above them:

### Avainluvut
The period's key metrics compared with the same period a year earlier, for example revenue and its growth (also organic or comparable growth when reported), operating profit (EBIT or adjusted EBIT) and its margin, earnings per share and operating cash flow, and the metrics that the company's business analysis and the earlier notes show to matter for this company (for example order intake, recurring revenue or segment figures). A short bullet list or a small table.

### Keskeiset tapahtumat
The most important events of the period and after it, as a few short bullets.

### Näkymät
The company's outlook or guidance as the report states it, and how it changed from the previous one when the earlier notes tell. Say so if the company gives no outlook.

Rules:
- Use only figures that the report states. Calculate a change only from figures printed in the report. The figures already extracted from the report are given for reference: use the same figures where they agree with the report.
- Keep the note concise, about 150–300 words. Focus on what is new in this period; don't repeat the business analysis.
- The earlier notes, some written by AI and the rest by the investor, show which metrics and themes the investor follows. Use them for focus and continuity, but don't copy their content.`;

const noteSchema = z.object({ text: z.string().describe("The note in Finnish markdown") });

export type PeriodNoteResult =
  | { written: true; noteId: number }
  | { written: false; reason: "notFound" | "notReport" | "alreadyWritten" | "empty" };

// Writes an AI note on the period of a report news item, unless one has been written already: from
// the report and all of its attachments, the figures extracted from it, the company's business
// analysis and its notes from the year before the report. The note is dated on the report's release
// day and linked to it.
export async function writePeriodNote(newsId: number): Promise<PeriodNoteResult> {
  const news = await prisma.news.findUnique({
    where: { id: newsId },
    select: {
      companyId: true,
      title: true,
      description: true,
      releasedAt: true,
      periodReviewedAt: true,
      category: { select: { name: true } },
      company: { select: { name: true } },
      attachments: { orderBy: { id: "asc" }, select: { url: true, name: true } },
    },
  });
  if (!news) return { written: false, reason: "notFound" };
  if (news.periodReviewedAt) return { written: false, reason: "alreadyWritten" };
  if (!isReportCategory(news.category.name)) return { written: false, reason: "notReport" };

  const date = helsinkiNoteDate(news.releasedAt);
  const [documents, businessAnalysis, notes, figures] = await Promise.all([
    downloadDocuments(news.attachments),
    businessAnalysisForPrompt(news.companyId),
    prisma.note.findMany({
      where: { companyId: news.companyId, date: { gte: toDbDate(yearBefore(date)), lte: toDbDate(date) } },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      select: { date: true, text: true, aiGenerated: true },
    }),
    extractedFigures(newsId),
  ]);

  const { text: rawText } = await structuredCompletion({
    schemaName: "period_note",
    schema: noteSchema,
    messages: [
      { role: "system", content: INSTRUCTIONS },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `Company: ${news.company.name}`,
              "",
              "Business analysis of the company:",
              businessAnalysis,
              "",
              "The investor's notes on the company from the year before the report:",
              notesForPrompt(
                notes.map((note) => ({ ...note, date: fromDbDate(note.date) })),
                MAX_NOTES_LENGTH,
              ),
              "",
              "Figures extracted from the report:",
              figuresForPrompt(figures),
              "",
              `The report (${news.category.name}), released ${news.releasedAt.toISOString()}: ${news.title}`,
              "",
              news.description,
            ].join("\n"),
          },
          ...documents.map(documentPart),
        ],
      },
    ],
  });
  const text = rawText.trim();
  if (!text) return { written: false, reason: "empty" };

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.news.updateMany({
      where: { id: newsId, periodReviewedAt: null },
      data: { periodReviewedAt: new Date() },
    });
    if (count === 0) return { written: false, reason: "alreadyWritten" } as const;
    // The same creation and update time marks the note unedited (see wasEdited).
    const now = new Date();
    const note = await tx.note.create({
      data: {
        companyId: news.companyId,
        date: toDbDate(date),
        text,
        newsId,
        aiGenerated: true,
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });
    return { written: true, noteId: note.id } as const;
  });
}

// The current values extracted from the news item's report, the latest period first, in the order
// of the fields.
async function extractedFigures(newsId: number): Promise<ExtractedFigure[]> {
  const periodSelect = { name: true, startTime: true, endTime: true } as const;
  const rows = await prisma.resultRow.findMany({
    where: { newsId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      reportingSeasonId: true,
      financialYearId: true,
      resultFieldId: true,
      value: true,
      resultField: {
        select: { name: true, order: true, valueFormat: true, resultFieldGroup: { select: { name: true, order: true } } },
      },
      reportingSeason: { select: { ...periodSelect, financialYear: { select: { ...periodSelect, unit: true } } } },
      financialYear: { select: { ...periodSelect, unit: true } },
    },
  });
  const latest = latestRows(
    rows,
    (row) => `${row.reportingSeasonId ?? ""}:${row.financialYearId ?? ""}:${row.resultFieldId}`,
  );
  return latest
    .map((row) => {
      const year = row.reportingSeason?.financialYear ?? row.financialYear;
      const period = row.reportingSeason ?? row.financialYear;
      const field = row.resultField;
      return {
        end: period?.endTime?.getTime() ?? 0,
        order: [field.resultFieldGroup.order ?? 0, field.order ?? 0],
        figure: {
          period: periodLabel(year?.name ?? null, row.reportingSeason?.name ?? null, period),
          field: [field.resultFieldGroup.name, field.name].filter(Boolean).join(": "),
          valueFormat: field.valueFormat,
          value: row.value == null ? null : Number(row.value),
          unit: year?.unit ?? "one",
        },
      };
    })
    .sort((a, b) => b.end - a.end || a.order[0] - b.order[0] || a.order[1] - b.order[1])
    .map((item) => item.figure);
}

function periodLabel(
  yearName: string | null,
  seasonName: string | null,
  period: { startTime: Date | null; endTime: Date | null } | null,
): string {
  const name = [yearName, seasonName].filter(Boolean).join(" ");
  const dates =
    period?.startTime && period.endTime
      ? `${helsinkiNoteDate(period.startTime)} – ${helsinkiNoteDate(period.endTime)}`
      : "";
  return [name, dates && `(${dates})`].filter(Boolean).join(" ") || "Unknown period";
}
