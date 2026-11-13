// A note's date is a calendar day without a time, passed around as "YYYY-MM-DD". Pure, so it runs
// on the client as well as on the server.

import { helsinkiDate, helsinkiTime } from "./helsinki-time.ts";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

// Date from its parts (month is 0-based).
function dateString(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month + 1)}-${pad(day)}`;
}

// Parts of a valid date (month is 0-based), or undefined.
export function parseNoteDate(value: unknown): { year: number; month: number; day: number } | undefined {
  const match = typeof value === "string" ? DATE_PATTERN.exec(value) : null;
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return undefined;
  return { year, month, day };
}

// Last millisecond of the day in Finnish time: the note shows the values as they were then.
export function endOfNoteDay(value: string): Date {
  const { year, month, day } = parseNoteDate(value)!;
  return new Date(helsinkiTime(year, month, day + 1).getTime() - 1);
}

// A date column (stored at midnight UTC) to a note date and back.
export function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toDbDate(value: string): Date {
  const { year, month, day } = parseNoteDate(value)!;
  return new Date(Date.UTC(year, month, day));
}

// Calendar day of the given instant in Finnish time, e.g. a news item's release day.
export function helsinkiNoteDate(date: Date): string {
  const { year, month, day } = helsinkiDate(date);
  return dateString(year, month, day);
}

// A local Date (as a date picker gives) to a note date and back.
export function fromLocalDate(date: Date): string {
  return dateString(date.getFullYear(), date.getMonth(), date.getDate());
}

export function toLocalDate(value: string): Date {
  const { year, month, day } = parseNoteDate(value)!;
  return new Date(year, month, day);
}
