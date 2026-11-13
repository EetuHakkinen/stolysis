"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { EodhdError } from "@/lib/eodhd";
import type { StockPricePoint } from "@/lib/stock-price";
import { loadStockPrices, refreshStaleStockPrices } from "@/lib/stock-prices";

// The company's saved closing prices, oldest first.
export async function getStockPrices(input: { companyId: number }): Promise<StockPricePoint[]> {
  await requireUserId();
  return loadStockPrices(z.number().int().positive().parse(input.companyId));
}

// Fetches the company's latest daily prices from EODHD when they are missing, and refreshes the
// page when any were saved, or to show why fetching failed. A failed fetch is retried the next day.
export async function updateStockPrices(input: { companyId: number }): Promise<void> {
  await requireUserId();
  const companyId = z.number().int().positive().parse(input.companyId);

  try {
    if ((await refreshStaleStockPrices(companyId)) > 0) refresh();
  } catch (error) {
    if (!(error instanceof EodhdError)) throw error;
    console.error(error);
    refresh();
  }
}
