import { SettingsIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCompany } from "@/actions/companies";
import { getDiscountVariables } from "@/actions/discounting";
import { getEstimates } from "@/actions/estimates";
import { getGraphs } from "@/actions/graphs";
import { getNewsFeed } from "@/actions/news";
import { getNewsForNote, getNoteSnapshot, getNotes } from "@/actions/notes";
import { getCompanyResults } from "@/actions/results";
import { getStockPrices } from "@/actions/stock-prices";
import { getValuation } from "@/actions/valuation";
import { ButtonLink } from "@/components/button-link";
import { CompanyNotes } from "@/components/company-notes";
import { CompanyTabs, type CompanyTab } from "@/components/company-tabs";
import { NewsFeed } from "@/components/news-feed";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { PageHeader } from "@/components/page-header";
import { parsePage } from "@/components/pagination";
import { ResultTables } from "@/components/result-tables";
import { SelectedScenarioProvider } from "@/components/selected-scenario";
import { StockPriceFetchWarning } from "@/components/stock-price-fetch-warning";
import { StockPriceSummary } from "@/components/stock-price-summary";
import { StockPriceUpdater } from "@/components/stock-price-updater";
import { needsPriceFetch, priceSymbol } from "@/lib/stock-price";

export default async function CompanyPage({
  params,
  searchParams,
}: PageProps<"/dashboard/company/[ticker]">) {
  const [{ ticker }, { page, scenario, tab, notesPage, newsId }, t] = await Promise.all([
    params,
    searchParams,
    getTranslations("CompanySettings"),
  ]);
  const company = await getCompany(ticker);
  if (!company) notFound();

  const [results, estimates, graphs, valuation, discountVariables, feed, notes, draft, stockPrices] = await Promise.all([
    getCompanyResults(company.id),
    getEstimates(company.id),
    getGraphs(company.id),
    getValuation(company.id),
    getDiscountVariables(company.id),
    getNewsFeed({ page: parsePage(page), ticker: company.ticker }),
    getNotes({ companyId: company.id, page: parsePage(notesPage) }),
    noteDraft(company.id, newsId),
    getStockPrices({ companyId: company.id }),
  ]);
  const path = `/dashboard/company/${encodeURIComponent(company.ticker)}`;
  const fetchPrices = needsPriceFetch({
    latest: stockPrices.at(-1)?.date ?? null,
    fetchedAt: company.pricesFetchedAt,
    now: new Date(),
  });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-6">
      <div className="flex flex-col gap-2">
        <PageBreadcrumbs items={[{ label: company.name }]} />
        <PageHeader title={company.name}>
          <ButtonLink href={`${path}/settings`} variant="ghost" size="icon" aria-label={t("open")}>
            <SettingsIcon />
          </ButtonLink>
        </PageHeader>
        <StockPriceSummary prices={stockPrices} />
        {company.pricesFetchError && (
          <StockPriceFetchWarning
            error={company.pricesFetchError}
            symbol={priceSymbol(company)}
            settingsHref={`${path}/settings`}
          />
        )}
        {fetchPrices && <StockPriceUpdater companyId={company.id} />}
      </div>
      <SelectedScenarioProvider initialId={parseId(scenario)}>
        <ResultTables
          companyId={company.id}
          results={results}
          estimates={estimates}
          graphs={graphs}
          valuation={valuation}
          discountVariables={discountVariables}
          stockPrices={stockPrices}
        />
        <CompanyTabs
          // A note from a news item opens in the notes.
          initialTab={draft ? "notes" : parseTab(tab)}
          news={<NewsFeed feed={feed} showTitle={false} pageHref={(page) => `${path}?page=${page}`} />}
          notes={
            <CompanyNotes
              companyId={company.id}
              feed={notes}
              draft={draft}
              pageHref={(page) => `${path}?tab=notes&notesPage=${page}`}
            />
          }
        />
      </SelectedScenarioProvider>
    </main>
  );
}

// A new note about the news item in the `?newsId=` search param, dated on its release day.
async function noteDraft(companyId: number, newsId: string | string[] | undefined) {
  const id = parseId(newsId);
  const news = id == null ? null : await getNewsForNote({ companyId, newsId: id });
  if (!news) return null;
  const snapshot = await getNoteSnapshot({ companyId, date: news.date });
  return snapshot && { date: news.date, news: news.news, snapshot };
}

function parseTab(value: string | string[] | undefined): CompanyTab {
  return value === "notes" ? "notes" : "news";
}

function parseId(value: string | string[] | undefined): number | undefined {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}
