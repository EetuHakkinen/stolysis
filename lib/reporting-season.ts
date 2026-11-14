import "server-only";
import type { Prisma } from "@/app/generated/prisma/client";
import { shiftedFinancialYear, shiftEnd, shiftStart } from "@/lib/financial-year";
import { helsinkiDate, helsinkiTime } from "@/lib/helsinki-time";

// Local calendar date in Finland (month is 0-based).
export type LocalDate = { year: number; month: number; day: number };

// Parses "YYYY-MM-DD" into a valid calendar date.
export function parseLocalDate(text: string): LocalDate | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return undefined;
  return { year, month, day };
}

// Seasons start at local midnight and end at the last millisecond of their last day,
// like the ones created by calendarFinancialYear.
function startOfDay({ year, month, day }: LocalDate): Date {
  return helsinkiTime(year, month, day);
}

function endOfDay({ year, month, day }: LocalDate): Date {
  return new Date(helsinkiTime(year, month, day + 1).getTime() - 1);
}

// The company's reporting season covering exactly the given days. When no financial year covers
// the period, one is created by shifting the company's nearest financial year (with its seasons)
// by whole years. Undefined when no season matches, e.g. a financial year covers the period but
// is divided differently, or the company has no financial year to copy.
export async function findOrCreateReportingSeason(
  tx: Prisma.TransactionClient,
  companyId: number,
  period: { start: LocalDate; end: LocalDate },
): Promise<{ id: number; confirmed: boolean } | undefined> {
  const startTime = startOfDay(period.start);
  const endTime = endOfDay(period.end);
  const findSeason = () =>
    tx.reportingSeason.findFirst({
      where: { financialYear: { companyId }, startTime, endTime },
      select: { id: true, confirmed: true },
    });

  const season = await findSeason();
  if (season) return season;

  const years = (
    await tx.financialYear.findMany({
      where: { companyId },
      include: { reportingSeasons: { orderBy: { id: "asc" } } },
    })
  ).filter(
    (year): year is typeof year & { startTime: Date; endTime: Date } =>
      year.startTime !== null && year.endTime !== null,
  );
  if (years.some((year) => year.startTime <= startTime && startTime <= year.endTime)) {
    return undefined;
  }

  const distance = (year: { startTime: Date }) =>
    Math.abs(year.startTime.getTime() - startTime.getTime());
  const nearest = years.sort((a, b) => distance(a) - distance(b))[0];
  if (!nearest) return undefined;

  const yearDiff = period.start.year - helsinkiDate(nearest.startTime).year;
  const shift = [yearDiff - 1, yearDiff, yearDiff + 1].find(
    (years) =>
      shiftStart(nearest.startTime, years) <= startTime &&
      startTime <= shiftEnd(nearest.endTime, years),
  );
  if (shift === undefined) return undefined;

  await tx.financialYear.create({
    data: { companyId, ...shiftedFinancialYear(nearest, shift, { estimate: false }) },
  });
  return (await findSeason()) ?? undefined;
}

// The company's financial year covering exactly the given days, if any.
export async function findFinancialYear(
  tx: Prisma.TransactionClient,
  companyId: number,
  period: { start: LocalDate; end: LocalDate },
): Promise<{ id: number; confirmed: boolean } | undefined> {
  const year = await tx.financialYear.findFirst({
    where: { companyId, startTime: startOfDay(period.start), endTime: endOfDay(period.end) },
    select: { id: true, confirmed: true },
  });
  return year ?? undefined;
}
