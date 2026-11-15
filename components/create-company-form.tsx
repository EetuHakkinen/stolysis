"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { validateCompany, type CompanyInput } from "@/actions/companies";
import { CompanyForm } from "@/components/company-form";
import { CompanyReportingFields } from "@/components/company-reporting-fields";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { initialDraft, sameReportingChoices } from "@/lib/company-draft";
import { loadCompanyDraft, saveCompanyDraft } from "@/lib/company-draft-storage";
import type { StatementReporting } from "@/lib/default-company-settings";
import type { ReportingCycle } from "@/lib/financial-year";
import type { ShareOption } from "@/lib/nasdaq-news";

const CREATE_COMPANY_FIELDS_PATH = "/dashboard/company/create/fields";

const SEASONAL: StatementReporting = { incomeStatement: "seasonal", balanceSheet: "seasonal", cashFlow: "seasonal" };

// The first step of creating a company: its name, ticker and reporting choices, which are kept in
// the draft for the second step, where its result fields are reviewed. Coming back from there, the
// form starts with the draft's values. Changed reporting choices rebuild the result fields from the
// defaults, after a confirmation if they have been edited.
export function CreateCompanyForm({ shares }: { shares: ShareOption[] }) {
  const t = useTranslations("CreateCompany");
  const router = useRouter();
  const [stored] = useState(loadCompanyDraft);
  const [reportingCycle, setReportingCycle] = useState<ReportingCycle>(stored?.reportingCycle ?? "quarterly");
  const [reporting, setReporting] = useState<StatementReporting>(stored?.reporting ?? SEASONAL);
  // The company waiting for the confirmation to rebuild the result fields.
  const [confirming, setConfirming] = useState<CompanyInput | null>(null);

  function proceed(company: CompanyInput, rebuild: boolean) {
    const kept = !rebuild && stored;
    saveCompanyDraft({
      company,
      reportingCycle,
      reporting,
      settings: kept ? stored.settings : initialDraft(reportingCycle, reporting),
      edited: kept ? stored.edited : false,
    });
    router.push(CREATE_COMPANY_FIELDS_PATH);
  }

  async function submit(company: CompanyInput) {
    const result = await validateCompany(company);
    if (result.errors) return result;
    const rebuild = !stored || !sameReportingChoices(stored, { reportingCycle, reporting });
    if (rebuild && stored?.edited) setConfirming(company);
    else proceed(company, rebuild);
    return {};
  }

  return (
    <>
      <CompanyForm
        initialValues={stored?.company}
        submit={submit}
        cancelHref="/dashboard"
        shares={shares}
        submitLabel={t("next")}
        pendingLabel={t("checking")}
      >
        <CompanyReportingFields
          reportingCycle={reportingCycle}
          onReportingCycleChange={setReportingCycle}
          reporting={reporting}
          onReportingChange={setReporting}
        />
      </CompanyForm>
      <ConfirmDialog
        open={confirming != null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title={t("resetTitle")}
        description={t("resetDescription")}
        confirmLabel={t("resetConfirm")}
        pendingLabel={t("resetConfirm")}
        destructive
        confirm={async () => {
          if (confirming) proceed(confirming, true);
        }}
      />
    </>
  );
}
