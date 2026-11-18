import type { Unit, ValueFormat } from "@/app/generated/prisma/client";
import { parseNoteDate } from "./note-date.ts";
import { UNIT_DIVISORS } from "./units.ts";

// Context for the AI notes on reports' periods. Pure, so it runs in tests without a db.

const UNIT_LABELS: Record<Unit, string> = { million: "M€", thousand: "t€", one: "€" };

// The same day a year earlier, as a note date ("YYYY-MM-DD"); 29 February becomes 28 February.
export function yearBefore(date: string): string {
  const { year, month, day } = parseNoteDate(date)!;
  const lastDay = new Date(Date.UTC(year - 1, month + 1, 0)).getUTCDate();
  return `${String(year - 1).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export type ContextNote = { date: string; text: string; aiGenerated: boolean };

// The notes for the AI, oldest first, each with its date and whether AI wrote it. Notes are given
// newest first, and the newest ones are taken while their texts fit in `maxLength` characters.
export function notesForPrompt(notes: ContextNote[], maxLength: number): string {
  const taken: ContextNote[] = [];
  let length = 0;
  for (const note of notes) {
    const text = note.text.trim();
    if (!text) continue;
    if (length + text.length > maxLength) break;
    length += text.length;
    taken.push({ ...note, text });
  }
  if (taken.length === 0) return "(no notes)";
  return taken
    .reverse()
    .map((note) => `<note date="${note.date}"${note.aiGenerated ? ` ai_generated="true"` : ""}>\n${note.text}\n</note>`)
    .join("\n\n");
}

export type ExtractedFigure = {
  // E.g. "2026 Q3 (2026-07-01 – 2026-09-30)".
  period: string;
  field: string;
  valueFormat: ValueFormat;
  // In whole euros for money fields; null when cleared.
  value: number | null;
  // Unit of the period's financial year, which money values are shown in.
  unit: Unit;
};

// The figures extracted from the report, a line per figure grouped by period, in the given order.
export function figuresForPrompt(figures: ExtractedFigure[]): string {
  const periods = new Map<string, string[]>();
  for (const figure of figures) {
    if (figure.value == null) continue;
    const lines = periods.get(figure.period) ?? [];
    lines.push(`- ${figure.field}: ${formatFigure(figure.value, figure)}`);
    periods.set(figure.period, lines);
  }
  if (periods.size === 0) return "(no figures)";
  return [...periods].map(([period, lines]) => [`${period}:`, ...lines].join("\n")).join("\n\n");
}

function formatFigure(value: number, { valueFormat, unit }: ExtractedFigure): string {
  if (valueFormat === "per_share") return `${value} €/osake`;
  if (valueFormat === "percent") return `${value} %`;
  return `${Math.round((value / UNIT_DIVISORS[unit]) * 100) / 100} ${UNIT_LABELS[unit]}`;
}

// Whether a note was changed after it was created: an AI note's times are equal when it's written.
export function wasEdited(note: { createdAt: Date; updatedAt: Date }): boolean {
  return note.updatedAt.getTime() > note.createdAt.getTime();
}
