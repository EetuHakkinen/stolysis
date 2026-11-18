"use client";

import { useState } from "react";
import { HistoryIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { getBusinessAnalysisHistory, type BusinessAnalysisChange } from "@/actions/business-analysis";
import { BusinessAnalysisSource } from "@/components/business-analysis-source";
import { TextDiff } from "@/components/text-diff";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// Dialog listing all changes to a company's business analysis, newest first: for each news item,
// how it changed each section it updated, and each edit by hand. Loaded when opened.
export function BusinessAnalysisHistory({ companyId }: { companyId: number }) {
  const t = useTranslations("BusinessAnalysis");
  const [changes, setChanges] = useState<BusinessAnalysisChange[] | null>(null);

  function changeOpen(open: boolean) {
    if (!open) return;
    setChanges(null);
    getBusinessAnalysisHistory({ companyId }).then(setChanges);
  }

  return (
    <Dialog onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <HistoryIcon />
            {t("history")}
          </Button>
        }
      />
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("historyTitle")}</DialogTitle>
        </DialogHeader>
        {changes == null ? (
          <p className="text-muted-foreground">{t("loading")}</p>
        ) : changes.length === 0 ? (
          <p className="text-muted-foreground">{t("noHistory")}</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {changes.map((change) => (
              <li key={change.key} className="flex flex-col gap-3 rounded-lg border p-3">
                <BusinessAnalysisSource version={change} />
                {change.changes.map((section) => (
                  <section key={section.category} className="flex flex-col gap-1">
                    <h4 className="text-sm font-semibold">{t(`categories.${section.category}`)}</h4>
                    <TextDiff before={section.before} after={section.after} />
                  </section>
                ))}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
