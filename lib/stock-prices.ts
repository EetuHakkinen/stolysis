import "server-only";
import { EodhdError, fetchDailyPrices } from "@/lib/eodhd";
import { fromDbDate, helsinkiNoteDate, toDbDate } from "@/lib/note-date";
import { prisma } from "@/lib/prisma";
import {
  fromPriceInt,
  needsPriceFetch,
  priceFetchStart,
  priceSymbol,
  toPriceInt,
  type StockPricePoint,
} from "@/lib/stock-price";

// The company's saved closing prices, oldest first.
export async function loadStockPrices(companyId: number): Promise<StockPricePoint[]> {
  const rows = await prisma.stockPrice.findMany({
    where: { companyId },
    orderBy: { date: "asc" },
    select: { date: true, close: true },
  });
  return rows.map((row) => ({ date: fromDbDate(row.date), close: fromPriceInt(row.close) }));
}

// When the company's prices need fetching (see needsPriceFetch), fetches its daily prices since the
// latest saved day (a year back when there are none) up to today, and saves them over any saved for
// the same days. Returns the number of days saved. The fetch time is saved even when fetching fails,
// so a failing fetch isn't retried until the next day, and so is why it failed, until a fetch
// succeeds. Throws an EodhdError when fetching fails.
export async function refreshStaleStockPrices(companyId: number): Promise<number> {
  const [company, latest] = await Promise.all([
    prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { ticker: true, priceSymbol: true, pricesFetchedAt: true },
    }),
    prisma.stockPrice.findFirst({ where: { companyId }, orderBy: { date: "desc" }, select: { date: true } }),
  ]);
  const now = new Date();
  const latestDate = latest && fromDbDate(latest.date);
  if (!needsPriceFetch({ latest: latestDate, fetchedAt: company.pricesFetchedAt, now })) return 0;

  // Saved first, so a page opened during the fetch doesn't fetch again.
  await prisma.company.update({ where: { id: companyId }, data: { pricesFetchedAt: now } });
  const today = helsinkiNoteDate(now);
  let prices;
  try {
    prices = await fetchDailyPrices({
      symbol: priceSymbol(company),
      from: priceFetchStart(latestDate, today),
      to: today,
    });
  } catch (error) {
    if (error instanceof EodhdError) {
      await prisma.company.update({ where: { id: companyId }, data: { pricesFetchError: error.reason } });
    }
    throw error;
  }

  await prisma.$transaction([
    ...prices.map(({ date, open, high, low, close, adjustedClose, volume }) => {
      const data = {
        open: toPriceInt(open),
        high: toPriceInt(high),
        low: toPriceInt(low),
        close: toPriceInt(close),
        adjustedClose: toPriceInt(adjustedClose),
        volume: BigInt(volume),
      };
      return prisma.stockPrice.upsert({
        where: { companyId_date: { companyId, date: toDbDate(date) } },
        create: { companyId, date: toDbDate(date), ...data },
        update: data,
      });
    }),
    prisma.company.update({ where: { id: companyId }, data: { pricesFetchError: null } }),
  ]);
  return prices.length;
}
