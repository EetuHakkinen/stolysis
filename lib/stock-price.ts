// Stock price helpers. Pure, so they run on the client as well as on the server.

import { helsinkiNoteDate } from "./note-date.ts";

// Prices are stored as integers in thousandths of the currency.
const PRICE_SCALE = 1000;

// Exchange suffix of Nasdaq Helsinki (main list and First North) in EODHD symbols.
const DEFAULT_EXCHANGE = "HE";

// The EODHD symbol used when the company has none of its own: its ticker on Nasdaq Helsinki.
export function defaultPriceSymbol(ticker: string): string {
  return `${ticker}.${DEFAULT_EXCHANGE}`;
}

export function priceSymbol(company: { ticker: string; priceSymbol: string | null }): string {
  return company.priceSymbol ?? defaultPriceSymbol(company.ticker);
}

// A price to its stored integer, rounded to three decimals, and back.
export function toPriceInt(price: number): number {
  return Math.round(price * PRICE_SCALE);
}

export function fromPriceInt(value: number): number {
  return value / PRICE_SCALE;
}

// First day ("YYYY-MM-DD") to fetch prices from: the latest saved day, whose close may have been
// fetched before the day ended or corrected since, or a year back from today when there are none.
export function priceFetchStart(latest: string | null, today: string): string {
  if (latest) return latest;
  const [year, month, day] = today.split("-").map(Number);
  // Feb 29 overflows to Mar 1 of the year before.
  return new Date(Date.UTC(year - 1, month - 1, day)).toISOString().slice(0, 10);
}

// The latest day whose closing price should be saved by now: the weekday before today. Holidays
// aren't known, so on the day after one this is the holiday.
export function expectedPriceDate(today: string): string {
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day - 1));
  // Saturday and Sunday go back to Friday.
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

// Whether the company's prices should be fetched: the latest saved day ("YYYY-MM-DD") is before
// the expected one and they haven't been fetched yet today (in Finnish time). Fetching at most
// once a day keeps a missing price, like that of a holiday, from using up the daily request limit.
export function needsPriceFetch({
  latest,
  fetchedAt,
  now,
}: {
  latest: string | null;
  fetchedAt: Date | null;
  now: Date;
}): boolean {
  const today = helsinkiNoteDate(now);
  if (latest != null && latest >= expectedPriceDate(today)) return false;
  return fetchedAt == null || helsinkiNoteDate(fetchedAt) < today;
}

// A day's closing price in the currency (not thousandths).
export type StockPricePoint = { date: string; close: number };

// Prices are shown in euros, the currency of Nasdaq Helsinki, with up to three decimals.
export const PRICE_FORMAT = {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
} as const;

// The latest price on or before the given day, from prices oldest first; null if there is none.
export function priceOn(prices: StockPricePoint[], date: string): StockPricePoint | null {
  return prices.findLast((price) => price.date <= date) ?? null;
}

export const PRICE_RANGES = ["1M", "3M", "6M", "1Y", "all"] as const;
export type PriceRange = (typeof PRICE_RANGES)[number];

const RANGE_MONTHS: Record<Exclude<PriceRange, "all">, number> = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12 };

// Prices (oldest first) of the range ending at the latest price.
export function pricesInRange(prices: StockPricePoint[], range: PriceRange): StockPricePoint[] {
  const latest = prices.at(-1);
  if (range === "all" || !latest) return prices;
  const [year, month, day] = latest.date.split("-").map(Number);
  // A day that the earlier month doesn't have overflows to the next month.
  const start = new Date(Date.UTC(year, month - 1 - RANGE_MONTHS[range], day)).toISOString().slice(0, 10);
  return prices.filter((price) => price.date >= start);
}

// A news item on the price chart, released on `date` ("YYYY-MM-DD" in Finnish time).
export type PriceChartNews = { id: number; title: string; date: string };

export type PriceChartPoint = StockPricePoint & { news: PriceChartNews[] };

// Prices (oldest first) with the news released on each day. News of a day without a price, like a
// weekend, go to the next day with one, when the market first reacts to them. News after the
// latest price aren't shown.
export function withNews(prices: StockPricePoint[], news: PriceChartNews[]): PriceChartPoint[] {
  const points = prices.map((price) => ({ ...price, news: [] as PriceChartNews[] }));
  for (const item of news) {
    points.find((point) => point.date >= item.date)?.news.push(item);
  }
  return points;
}
