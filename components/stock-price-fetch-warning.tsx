import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { StockPriceFetchError } from "@/app/generated/prisma/client";

// Why the latest fetch of the company's stock prices failed; for an unknown price symbol, with a
// link to the settings where it is changed.
export async function StockPriceFetchWarning({
  error,
  symbol,
  settingsHref,
}: {
  error: StockPriceFetchError;
  symbol: string;
  settingsHref: string;
}) {
  const t = await getTranslations("StockPrices.errors");

  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
      <span>
        {t(error, { symbol })}
        {error === "notFound" && (
          <>
            {" "}
            <Link href={settingsHref} className="underline underline-offset-2">
              {t("openSettings")}
            </Link>
          </>
        )}
      </span>
    </p>
  );
}
