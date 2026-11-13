// Stock price helpers. Pure, so they run on the client as well as on the server.

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
