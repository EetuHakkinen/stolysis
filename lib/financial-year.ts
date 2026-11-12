import type { FinancialYear, Prisma, ReportingSeason, Unit } from "@/app/generated/prisma/client";
import { helsinkiDate, helsinkiTime, TIME_ZONE } from "@/lib/helsinki-time";

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

// The given instant (a local midnight) moved by whole years.
export function shiftStart(start: Date, years: number): Date {
  const { year, month, day } = helsinkiDate(start);
  return startOfDay(year + years, month, day);
}

// The given instant (the last millisecond of a local day) moved by whole years.
export function shiftEnd(end: Date, years: number): Date {
  return new Date(shiftStart(new Date(end.getTime() + 1), years).getTime() - 1);
}

type DatedFinancialYear = FinancialYear & {
  startTime: Date;
  endTime: Date;
  reportingSeasons: ReportingSeason[];
};

// Copy of the financial year with its reporting seasons moved by whole years, the years in its
// name included, ready to be created for the same company.
export function shiftedFinancialYear(
  year: DatedFinancialYear,
  shift: number,
  { estimate }: { estimate: boolean },
): Omit<Prisma.FinancialYearUncheckedCreateInput, "companyId"> {
  return {
    name: year.name?.replace(/\d{4}/g, (name) => String(Number(name) + shift)) ?? null,
    unit: year.unit,
    startTime: shiftStart(year.startTime, shift),
    endTime: shiftEnd(year.endTime, shift),
    reportingSeasons: {
      create: year.reportingSeasons.map((season) => ({
        name: season.name,
        estimate,
        startTime: season.startTime && shiftStart(season.startTime, shift),
        endTime: season.endTime && shiftEnd(season.endTime, shift),
      })),
    },
  };
}

// Makes sure the company has financial years up to the given number of years after the one
// covering the current day, creating the missing ones by moving its latest financial year (with
// its reporting seasons) forward. Created seasons are marked as estimates. Does nothing for a
// company without financial years.
export async function ensureFinancialYears(
  tx: Prisma.TransactionClient,
  companyId: number,
  yearsAhead: number,
): Promise<void> {
  // Serialize per company, so concurrent calls don't create the same years twice.
  await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('financial_year'), ${companyId}::int)) AS lock`;

  const latest = await tx.financialYear.findFirst({
    where: { companyId, startTime: { not: null }, endTime: { not: null } },
    orderBy: [{ startTime: "desc" }, { id: "desc" }],
    include: { reportingSeasons: { orderBy: [{ startTime: "asc" }, { id: "asc" }] } },
  });
  if (!latest?.startTime || !latest.endTime) return;
  const dated = { ...latest, startTime: latest.startTime, endTime: latest.endTime };

  // Shift of the latest year that covers the current day, possibly negative.
  const now = new Date();
  let currentShift = 0;
  while (shiftEnd(dated.endTime, currentShift - 1) >= now) currentShift--;
  while (shiftEnd(dated.endTime, currentShift) < now) currentShift++;

  for (let shift = 1; shift <= currentShift + yearsAhead; shift++) {
    await tx.financialYear.create({
      data: { companyId, ...shiftedFinancialYear(dated, shift, { estimate: true }) },
    });
  }
}
