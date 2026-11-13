import "server-only";
import { fetchDailyPrices } from "@/lib/eodhd";
import { fromDbDate, helsinkiNoteDate, toDbDate } from "@/lib/note-date";
import { prisma } from "@/lib/prisma";
import { priceFetchStart, priceSymbol, toPriceInt } from "@/lib/stock-price";

// Fetches the company's daily prices since the latest saved day (a year back when there are none)
// up to today, and saves them over any saved for the same days. Returns the number of days saved.
// Throws an EodhdError when fetching fails.
export async function refreshCompanyStockPrices(companyId: number): Promise<number> {
  const [company, latest] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { ticker: true, priceSymbol: true } }),
    prisma.stockPrice.findFirst({ where: { companyId }, orderBy: { date: "desc" }, select: { date: true } }),
  ]);

  const today = helsinkiNoteDate(new Date());
  const prices = await fetchDailyPrices({
    symbol: priceSymbol(company),
    from: priceFetchStart(latest && fromDbDate(latest.date), today),
    to: today,
  });

  await prisma.$transaction([
    ...prices.map(({ date, close, adjustedClose }) => {
      const data = { close: toPriceInt(close), adjustedClose: toPriceInt(adjustedClose) };
      return prisma.stockPrice.upsert({
        where: { companyId_date: { companyId, date: toDbDate(date) } },
        create: { companyId, date: toDbDate(date), ...data },
        update: data,
      });
    }),
    prisma.company.update({ where: { id: companyId }, data: { pricesFetchedAt: new Date() } }),
  ]);
  return prices.length;
}
