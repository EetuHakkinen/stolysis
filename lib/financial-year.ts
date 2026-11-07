import type { Prisma } from "@/app/generated/prisma/client";
import { helsinkiTime, TIME_ZONE } from "@/lib/helsinki-time";

// Financial years and reporting seasons start and end at local midnight in Finland
// (month is 0-based, may overflow).
function startOfDay(year: number, month: number, day: number): Date {
  return helsinkiTime(year, month, day);
}

// Local year of the given instant.
function yearOf(date: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric" }).format(date));
}

// Period from the start of startMonth up to the last millisecond before endMonth begins.
function period(year: number, startMonth: number, endMonth: number) {
  return {
    startTime: startOfDay(year, startMonth, 1),
    endTime: new Date(startOfDay(year, endMonth, 1).getTime() - 1),
  };
}

// Calendar-year financial year with its four quarters as reporting seasons,
// ready to be passed to a nested `financialYears: { create }` on a company.
export function calendarFinancialYear(
  year: number = yearOf(new Date()),
): Prisma.FinancialYearCreateWithoutCompanyInput {
  return {
    name: String(year),
    unit: "million",
    ...period(year, 0, 12),
    reportingSeasons: {
      create: [0, 1, 2, 3].map((quarter) => ({
        name: `Q${quarter + 1}`,
        estimate: false,
        ...period(year, quarter * 3, quarter * 3 + 3),
      })),
    },
  };
}
