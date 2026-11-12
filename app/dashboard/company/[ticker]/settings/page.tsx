import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCompany } from "@/actions/companies";
import { getEstimateScenarios } from "@/actions/estimates";
import { getResultFieldGroups } from "@/actions/result-field-groups";
import { CompanyDetailsSettings } from "@/components/company-details-settings";
import { EstimateScenarioSettings } from "@/components/estimate-scenario-settings";
import { ResultFieldGroupSettings } from "@/components/result-field-group-settings";
import { ResultFieldSettings } from "@/components/result-field-settings";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { PageHeader } from "@/components/page-header";

export default async function CompanySettingsPage({
  params,
}: PageProps<"/dashboard/company/[ticker]/settings">) {
  const [{ ticker }, t] = await Promise.all([params, getTranslations("CompanySettings")]);
  const company = await getCompany(ticker);
  if (!company) notFound();

  const [scenarios, groups] = await Promise.all([
    getEstimateScenarios(company.id),
    getResultFieldGroups(company.id),
  ]);
  const companyPath = `/dashboard/company/${encodeURIComponent(company.ticker)}`;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-6">
      <div className="flex flex-col gap-2">
        <PageBreadcrumbs items={[{ label: company.name, href: companyPath }, { label: t("title") }]} />
        <PageHeader title={`${company.name}: ${t("title")}`} />
      </div>
      <CompanyDetailsSettings company={company} />
      <EstimateScenarioSettings companyId={company.id} scenarios={scenarios} />
      <ResultFieldGroupSettings companyId={company.id} groups={groups} />
      <ResultFieldSettings groups={groups} />
    </main>
  );
}
