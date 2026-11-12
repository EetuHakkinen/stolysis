"use client";

import { useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { applyDefaultSettings } from "@/actions/companies";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { AppliedSettings } from "@/lib/default-company-settings";

// Company settings section with a button that adds the parts of the default settings the company
// doesn't have yet, and a summary of what was added.
export function DefaultSettingsSettings({ companyId }: { companyId: number }) {
  const t = useTranslations("DefaultSettings");
  const [applied, setApplied] = useState<AppliedSettings>();

  const added = applied && applied.scenarios + applied.groups + applied.fields + applied.formulas > 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <ConfirmDialog
          title={t("confirmTitle")}
          description={t("confirmDescription")}
          confirmLabel={t("apply")}
          pendingLabel={t("applying")}
          confirm={async () => setApplied(await applyDefaultSettings({ companyId }))}
          trigger={
            <Button variant="outline" size="sm">
              <RefreshCwIcon />
              {t("apply")}
            </Button>
          }
        />
      </div>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      {applied && (
        <p className="text-sm" role="status">
          {added ? t("added", applied) : t("nothingAdded")}
          {applied.skippedFormulas > 0 && ` ${t("skippedFormulas", { count: applied.skippedFormulas })}`}
        </p>
      )}
    </section>
  );
}
