import "server-only";
import { z } from "zod";

// Minimal EODHD end-of-day prices client.
// https://eodhd.com/financial-apis/api-for-historical-data-and-volumes

const API_URL = "https://eodhd.com/api/eod";

// Why a request failed: the daily request limit is used up, the symbol is unknown, or anything else.
export type EodhdErrorReason = "quota" | "notFound" | "failed";

export class EodhdError extends Error {
  constructor(
    readonly reason: EodhdErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "EodhdError";
  }
}

const responseSchema = z.array(
  z.object({
    date: z.string(),
    open: z.number(),
    high: z.number(),
    low: z.number(),
    close: z.number(),
    adjusted_close: z.number(),
    volume: z.number().int(),
  }),
);

export type DailyPrice = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedClose: number;
  volume: number;
};

// Prices of the symbol (e.g. "HARVIA.HE") on each trading day between the given days
// ("YYYY-MM-DD", both included), oldest first.
export async function fetchDailyPrices({
  symbol,
  from,
  to,
}: {
  symbol: string;
  from: string;
  to: string;
}): Promise<DailyPrice[]> {
  const apiKey = process.env.EODHD_API_KEY;
  if (!apiKey) throw new Error("EODHD_API_KEY is not set");

  const params = new URLSearchParams({ api_token: apiKey, fmt: "json", from, to });
  let response: Response;
  try {
    response = await fetch(`${API_URL}/${encodeURIComponent(symbol)}?${params}`, { cache: "no-store" });
  } catch (error) {
    throw new EodhdError("failed", `EODHD request failed: ${error}`);
  }
  if (!response.ok) {
    const reason = response.status === 404 ? "notFound" : [402, 429].includes(response.status) ? "quota" : "failed";
    throw new EodhdError(reason, `EODHD request failed: ${response.status} ${await response.text()}`);
  }

  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success) throw new EodhdError("failed", `Unexpected EODHD response: ${parsed.error.message}`);
  return parsed.data.map(({ adjusted_close, ...price }) => ({ ...price, adjustedClose: adjusted_close }));
}
