"use client";

import { useState } from "react";
import { HistoryIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { BusinessAnalysisCategory } from "@/app/generated/prisma/enums";
import { getBusinessAnalysisHistory, type BusinessAnalysisVersion } from "@/actions/business-analysis";
import { BusinessAnalysisSource } from "@/components/business-analysis-source";
import { TextDiff } from "@/components/text-diff";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// Dialog listing all versions of a section of a company's business analysis, newest first, each
// with the news it was written from or a mark that it was written by hand, and what it changed from
// the version before it (the first version is all added). Loaded when opened.
export function BusinessAnalysisHistory({
  companyId,
  category,
  title,
}: {
  companyId: number;
  category: BusinessAnalysisCategory;
  title: string;
}) {
  const t = useTranslations("BusinessAnalysis");
  const [versions, setVersions] = useState<BusinessAnalysisVersion[] | null>(null);

  function changeOpen(open: boolean) {
    if (!open) return;
    setVersions(null);
    getBusinessAnalysisHistory({ companyId, category }).then(setVersions);
  }

  return (
    <Dialog onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={t("history")} title={t("history")}>
            <HistoryIcon />
          </Button>
        }
      />
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("historyTitle", { section: title })}</DialogTitle>
        </DialogHeader>
        {versions == null ? (
          <p className="text-muted-foreground">{t("loading")}</p>
        ) : versions.length === 0 ? (
          <p className="text-muted-foreground">{t("noHistory")}</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {versions.map((version, i) => (
              <li key={version.id} className="flex flex-col gap-2 rounded-lg border p-3">
                <BusinessAnalysisSource version={version} />
                <TextDiff before={versions[i + 1]?.content ?? ""} after={version.content} />
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
