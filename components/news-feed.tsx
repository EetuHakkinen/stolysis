import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { NewsFeedPage } from "@/actions/news";
import { AddNewsDialog } from "@/components/add-news-dialog";
import { CompanyBadge } from "@/components/company-badge";
import { NewsCategoryBadge } from "@/components/news-category-badge";
import { Pagination } from "@/components/pagination";
import { ReleaseTime } from "@/components/release-time";

// Paginated list of news, each linking to the full article.
// `showCompany` tags each item with its company, for feeds that mix companies.
export async function NewsFeed({
  feed: { news, page, pageCount },
  showCompany = false,
  pageHref,
}: {
  feed: NewsFeedPage;
  showCompany?: boolean;
  pageHref: (page: number) => string;
}) {
  const t = await getTranslations("News");

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <AddNewsDialog />
      </div>
      {news.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {news.map((item) => (
            <li key={item.id} className="flex flex-col gap-1 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <ReleaseTime date={item.releasedAt} />
                {showCompany && <CompanyBadge company={item.company} />}
                <NewsCategoryBadge category={item.category} />
              </div>
              <Link href={`/dashboard/news/${item.id}`} className="group flex flex-col gap-1">
                <span className="font-medium group-hover:underline">{item.title}</span>
                <span className="line-clamp-2 text-sm text-muted-foreground">{item.preview}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageCount={pageCount} href={pageHref} />
    </section>
  );
}
