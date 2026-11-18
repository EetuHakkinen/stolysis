"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { BusinessAnalysisVersion } from "@/actions/business-analysis";
import { TIME_ZONE } from "@/lib/helsinki-time";

// When a version of a business analysis section was written, and from which news, linked, or that
// it was written by hand.
export function BusinessAnalysisSource({ version }: { version: Pick<BusinessAnalysisVersion, "createdAt" | "news"> }) {
  const t = useTranslations("BusinessAnalysis");
  const format = useFormatter();
  const date = format.dateTime(version.createdAt, { dateStyle: "medium", timeZone: TIME_ZONE });

  return (
    <span className="text-xs text-muted-foreground">
      {version.news
        ? t.rich("fromNews", {
            date,
            news: () => (
              <Link
                href={`/dashboard/news/${version.news!.id}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {version.news!.title}
              </Link>
            ),
          })
        : t("byHand", { date })}
    </span>
  );
}
