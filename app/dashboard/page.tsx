import { PlusIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getCompanies } from "@/actions/companies";
import { getNewsFeed } from "@/actions/news";
import { ButtonLink } from "@/components/button-link";
import { CompaniesTable } from "@/components/companies-table";
import { NewsFeed } from "@/components/news-feed";
import { PageHeader } from "@/components/page-header";
import { parsePage } from "@/components/pagination";

export default async function Dashboard({ searchParams }: PageProps<"/dashboard">) {
  const t = await getTranslations("Companies");
  const { page } = await searchParams;
  const [companies, feed] = await Promise.all([
    getCompanies(),
    getNewsFeed({ page: parsePage(page) }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-6">
      <div className="flex flex-col gap-4">
        <PageHeader title={t("title")}>
          <ButtonLink href="/dashboard/company/create">
            <PlusIcon />
            {t("new")}
          </ButtonLink>
        </PageHeader>
        <CompaniesTable companies={companies} />
      </div>
      <NewsFeed feed={feed} showCompany pageHref={(page) => `/dashboard?page=${page}`} />
    </main>
  );
}
