import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { NewsFeedPage } from "@/actions/news";
import { AddNewsDialog } from "@/components/add-news-dialog";
import { CompanyBadge } from "@/components/company-badge";
import { NewsCategoryBadge } from "@/components/news-category-badge";
import { Pagination } from "@/components/pagination";
import { RefreshNewsButton } from "@/components/refresh-news-button";
import { ReleaseTime } from "@/components/release-time";

// Paginated list of news, each linking to the full article.
// `showCompany` tags each item with its company, for feeds that mix companies. Without `showTitle`,
// e.g. in a tab named after the news, the title is left out. With `refreshable`, the feed has a
// button that checks the company's latest news from Nasdaq (within NewsFetchProvider).
export async function NewsFeed({
  feed: { news, page, pageCount },
  showCompany = false,
  showTitle = true,
  pageHref,
  refreshable = false,
}: {
  feed: NewsFeedPage;
  showCompany?: boolean;
  showTitle?: boolean;
  pageHref: (page: number) => string;
  refreshable?: boolean;
}) {
  const t = await getTranslations("News");

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        {showTitle ? <h2 className="text-xl font-semibold">{t("title")}</h2> : <span />}
        <div className="flex items-center gap-1">
          {refreshable && <RefreshNewsButton />}
          <AddNewsDialog />
        </div>
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
