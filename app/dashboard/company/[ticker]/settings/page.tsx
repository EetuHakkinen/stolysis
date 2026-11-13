import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCompany } from "@/actions/companies";
import { getEstimateScenarios } from "@/actions/estimates";
import { getGraphs } from "@/actions/graphs";
import { getResultFieldGroups } from "@/actions/result-field-groups";
import { CompanyDetailsSettings } from "@/components/company-details-settings";
import { DefaultSettingsSettings } from "@/components/default-settings-settings";
import { EstimateScenarioSettings } from "@/components/estimate-scenario-settings";
import { GraphSettings } from "@/components/graph-settings";
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

  const [scenarios, groups, graphs] = await Promise.all([
    getEstimateScenarios(company.id),
    getResultFieldGroups(company.id),
    getGraphs(company.id),
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
      <GraphSettings companyId={company.id} graphs={graphs} groups={groups} />
      <DefaultSettingsSettings companyId={company.id} />
    </main>
  );
}
