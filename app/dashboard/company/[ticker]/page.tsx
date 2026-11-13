import { SettingsIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCompany } from "@/actions/companies";
import { getDiscountVariables } from "@/actions/discounting";
import { getEstimates } from "@/actions/estimates";
import { getGraphs } from "@/actions/graphs";
import { getNewsFeed } from "@/actions/news";
import { getCompanyResults } from "@/actions/results";
import { getValuation } from "@/actions/valuation";
import { ButtonLink } from "@/components/button-link";
import { NewsFeed } from "@/components/news-feed";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { PageHeader } from "@/components/page-header";
import { parsePage } from "@/components/pagination";
import { ResultTables } from "@/components/result-tables";

export default async function CompanyPage({
  params,
  searchParams,
}: PageProps<"/dashboard/company/[ticker]">) {
  const [{ ticker }, { page, scenario }, t] = await Promise.all([
    params,
    searchParams,
    getTranslations("CompanySettings"),
  ]);
  const company = await getCompany(ticker);
  if (!company) notFound();

  const [results, estimates, graphs, valuation, discountVariables, feed] = await Promise.all([
    getCompanyResults(company.id),
    getEstimates(company.id),
    getGraphs(company.id),
    getValuation(company.id),
    getDiscountVariables(company.id),
    getNewsFeed({ page: parsePage(page), ticker: company.ticker }),
  ]);
  const path = `/dashboard/company/${encodeURIComponent(company.ticker)}`;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-6">
      <div className="flex flex-col gap-2">
        <PageBreadcrumbs items={[{ label: company.name }]} />
        <PageHeader title={company.name}>
          <ButtonLink href={`${path}/settings`} variant="ghost" size="icon" aria-label={t("open")}>
            <SettingsIcon />
          </ButtonLink>
        </PageHeader>
      </div>
      <ResultTables
        companyId={company.id}
        results={results}
        estimates={estimates}
        graphs={graphs}
        valuation={valuation}
        discountVariables={discountVariables}
        scenarioId={parseScenarioId(scenario)}
      />
      <NewsFeed feed={feed} pageHref={(page) => `${path}?page=${page}`} />
    </main>
  );
}

function parseScenarioId(value: string | string[] | undefined): number | undefined {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}
