import { notFound } from "next/navigation";
import { getCompany } from "@/actions/companies";
import { getNewsFeed } from "@/actions/news";
import { getCompanyResults } from "@/actions/results";
import { NewsFeed } from "@/components/news-feed";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { PageHeader } from "@/components/page-header";
import { parsePage } from "@/components/pagination";
import { ResultTables } from "@/components/result-tables";

export default async function CompanyPage({
  params,
  searchParams,
}: PageProps<"/dashboard/company/[ticker]">) {
  const [{ ticker }, { page }] = await Promise.all([params, searchParams]);
  const company = await getCompany(ticker);
  if (!company) notFound();

  const [results, feed] = await Promise.all([
    getCompanyResults(company.id),
    getNewsFeed({ page: parsePage(page), ticker: company.ticker }),
  ]);
  const path = `/dashboard/company/${encodeURIComponent(company.ticker)}`;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-6">
      <div className="flex flex-col gap-2">
        <PageBreadcrumbs items={[{ label: company.name }]} />
        <PageHeader title={company.name} />
      </div>
      <ResultTables results={results} />
      <NewsFeed feed={feed} pageHref={(page) => `${path}?page=${page}`} />
    </main>
  );
}
