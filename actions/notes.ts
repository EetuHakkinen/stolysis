"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { fromDbDate, helsinkiNoteDate, parseNoteDate, toDbDate } from "@/lib/note-date";
import { loadSnapshotData, noteSnapshot, type NoteSnapshot } from "@/lib/note-snapshot";
import { prisma } from "@/lib/prisma";

const NOTES_PAGE_SIZE = 20;

export type NoteNews = { id: number; title: string; releasedAt: Date };

export type NoteItem = {
  id: number;
  // "YYYY-MM-DD"
  date: string;
  text: string;
  news: NoteNews | null;
  snapshot: NoteSnapshot;
};

export type NotesPage = { notes: NoteItem[]; page: number; pageCount: number };

const newsSelect = { id: true, title: true, releasedAt: true } as const;

// One page of a company's notes, newest first, each with the company's estimates and multiples at
// the end of its date.
export async function getNotes({ companyId, page }: { companyId: number; page: number }): Promise<NotesPage> {
  await requireUserId();

  const where = { companyId: idSchema.parse(companyId) };
  const total = await prisma.note.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / NOTES_PAGE_SIZE));
  // Parameters come from the client, so clamp them despite the type.
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount);

  const [rows, data] = await Promise.all([
    prisma.note.findMany({
      where,
      // id breaks ties so notes of the same day keep a stable order across pages.
      orderBy: [{ date: "desc" }, { id: "desc" }],
      skip: (current - 1) * NOTES_PAGE_SIZE,
      take: NOTES_PAGE_SIZE,
      select: { id: true, date: true, text: true, news: { select: newsSelect } },
    }),
    loadSnapshotData(companyId),
  ]);

  return {
    notes: rows.map((row) => {
      const date = fromDbDate(row.date);
      return { ...row, date, snapshot: noteSnapshot(data, date) };
    }),
    page: current,
    pageCount,
  };
}

// The company's estimates and multiples at the end of the given date, for a note whose date is
// being changed. Null for an invalid date.
export async function getNoteSnapshot(input: { companyId: number; date: string }): Promise<NoteSnapshot | null> {
  await requireUserId();
  if (!parseNoteDate(input.date)) return null;
  return noteSnapshot(await loadSnapshotData(idSchema.parse(input.companyId)), input.date);
}

// A company's news for linking a note to one, newest first.
export async function getNoteNewsOptions({ companyId }: { companyId: number }): Promise<NoteNews[]> {
  await requireUserId();
  return prisma.news.findMany({
    where: { companyId: idSchema.parse(companyId) },
    orderBy: [{ releasedAt: "desc" }, { id: "desc" }],
    select: newsSelect,
  });
}

// A company's news item for a new note about it, with its release day as the note's date. Null if
// the news isn't the company's.
export async function getNewsForNote(input: {
  companyId: number;
  newsId: number;
}): Promise<{ news: NoteNews; date: string } | null> {
  await requireUserId();
  const parsed = z.object({ companyId: idSchema, newsId: idSchema }).safeParse(input);
  if (!parsed.success) return null;
  const news = await prisma.news.findFirst({
    where: { id: parsed.data.newsId, companyId: parsed.data.companyId },
    select: newsSelect,
  });
  return news && { news, date: helsinkiNoteDate(news.releasedAt) };
}

// Notes linked to a news item, newest first.
export async function getNotesForNews({
  newsId,
}: {
  newsId: number;
}): Promise<{ id: number; date: string; text: string }[]> {
  await requireUserId();
  const parsed = idSchema.safeParse(newsId);
  if (!parsed.success) return [];
  const rows = await prisma.note.findMany({
    where: { newsId: parsed.data },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    select: { id: true, date: true, text: true },
  });
  return rows.map((row) => ({ ...row, date: fromDbDate(row.date) }));
}

const idSchema = z.number().int().positive();

const noteSchema = z.object({
  date: z.string().refine((date) => parseNoteDate(date) != null),
  text: z.string().max(100_000),
  newsId: idSchema.nullable(),
});

// Whether the news, if any, is the company's.
async function isCompanyNews(companyId: number, newsId: number | null) {
  if (newsId == null) return true;
  return (await prisma.news.count({ where: { id: newsId, companyId } })) > 0;
}

// Creates a note on a company. Empty notes aren't saved.
export async function createNote(input: {
  companyId: number;
  date: string;
  text: string;
  newsId: number | null;
}): Promise<{ id?: number }> {
  await requireUserId();

  const parsed = noteSchema
    .extend({ companyId: idSchema, text: noteSchema.shape.text.refine((text) => text.trim() !== "") })
    .safeParse(input);
  if (!parsed.success) return {};
  const { companyId, date, text, newsId } = parsed.data;

  const companies = await prisma.company.count({ where: { id: companyId } });
  if (companies === 0 || !(await isCompanyNews(companyId, newsId))) return {};

  const note = await prisma.note.create({
    data: { companyId, date: toDbDate(date), text, newsId },
    select: { id: true },
  });
  return { id: note.id };
}

// Saves a note's date, text and linked news.
export async function updateNote(input: {
  noteId: number;
  date: string;
  text: string;
  newsId: number | null;
}): Promise<{ saved: boolean }> {
  await requireUserId();

  const parsed = noteSchema.extend({ noteId: idSchema }).safeParse(input);
  if (!parsed.success) return { saved: false };
  const { noteId, date, text, newsId } = parsed.data;

  const note = await prisma.note.findUnique({ where: { id: noteId }, select: { companyId: true } });
  if (!note || !(await isCompanyNews(note.companyId, newsId))) return { saved: false };

  await prisma.note.update({ where: { id: noteId }, data: { date: toDbDate(date), text, newsId } });
  return { saved: true };
}

export async function deleteNote(input: { noteId: number }): Promise<void> {
  await requireUserId();
  await prisma.note.deleteMany({ where: { id: idSchema.parse(input.noteId) } });
  refresh();
}
