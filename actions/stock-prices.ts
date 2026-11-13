"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { EodhdError, type EodhdErrorReason } from "@/lib/eodhd";
import { refreshCompanyStockPrices } from "@/lib/stock-prices";

// Error values are translation keys under StockPrices.errors.
export type RefreshStockPricesResult = { count: number; error?: never } | { error: EodhdErrorReason };

// Fetches the company's latest daily prices from EODHD and saves them.
export async function refreshStockPrices(input: { companyId: number }): Promise<RefreshStockPricesResult> {
  await requireUserId();
  const companyId = z.number().int().positive().parse(input.companyId);

  try {
    const count = await refreshCompanyStockPrices(companyId);
    refresh();
    return { count };
  } catch (error) {
    if (!(error instanceof EodhdError)) throw error;
    console.error(error);
    return { error: error.reason };
  }
}
