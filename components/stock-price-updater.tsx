"use client";

import { useEffect, useRef } from "react";
import { updateStockPrices } from "@/actions/stock-prices";

// Fetches the company's missing stock prices once the page has loaded, without holding up the
// page; the page refreshes when prices were saved. Renders nothing.
export function StockPriceUpdater({ companyId }: { companyId: number }) {
  const started = useRef(false);

  useEffect(() => {
    // Effects run twice in development.
    if (started.current) return;
    started.current = true;
    void updateStockPrices({ companyId });
  }, [companyId]);

  return null;
}
