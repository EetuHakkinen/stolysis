import type { Prisma } from "@/app/generated/prisma/client";

// Financial years and reporting seasons start and end at local midnight in Finland.
const TIME_ZONE = "Europe/Helsinki";

// Offset of the time zone from UTC (in ms) at the given instant.
function timeZoneOffset(date: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, Number(value)]),
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// Instant of local midnight at the start of the given day (month is 0-based, may overflow).
function startOfDay(year: number, month: number, day: number): Date {
  const utcMidnight = Date.UTC(year, month, day);
  return new Date(utcMidnight - timeZoneOffset(new Date(utcMidnight)));
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
