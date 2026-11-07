import type { Prisma, Unit } from "@/app/generated/prisma/client";
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

export type ReportingCycle = "quarterly" | "halfYearly" | "yearly";

// Reporting seasons per financial year, with their names. A yearly season has no name of its
// own: the financial year's name is enough.
const CYCLE_SEASONS: Record<ReportingCycle, (string | null)[]> = {
  quarterly: ["Q1", "Q2", "Q3", "Q4"],
  halfYearly: ["H1", "H2"],
  yearly: [null],
};

// Length of a reporting season in months, by the number of seasons in a financial year.
export function seasonMonths(seasonCount: number): number | undefined {
  const cycle = Object.values(CYCLE_SEASONS).find((seasons) => seasons.length === seasonCount);
  return cycle && 12 / cycle.length;
}

// 12-month financial year starting at the start of startMonth (0-based) of the given year, divided
// into reporting seasons by the cycle, ready to be passed to a nested `financialYears: { create }`
// on a company. A calendar year is named by its year, e.g. "2026", others by both years,
// e.g. "2025/2026".
export function financialYear({
  year,
  startMonth = 0,
  cycle = "quarterly",
  unit = "million",
}: {
  year: number;
  startMonth?: number;
  cycle?: ReportingCycle;
  unit?: Unit;
}): Prisma.FinancialYearCreateWithoutCompanyInput {
  const seasons = CYCLE_SEASONS[cycle];
  const months = 12 / seasons.length;
  return {
    name: startMonth === 0 ? String(year) : `${year}/${year + 1}`,
    unit,
    ...period(year, startMonth, startMonth + 12),
    reportingSeasons: {
      create: seasons.map((name, index) => ({
        name,
        estimate: false,
        ...period(year, startMonth + index * months, startMonth + (index + 1) * months),
      })),
    },
  };
}

// Calendar-year financial year with its four quarters as reporting seasons.
export function calendarFinancialYear(
  year: number = yearOf(new Date()),
): Prisma.FinancialYearCreateWithoutCompanyInput {
  return financialYear({ year });
}
