import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getNews } from "@/actions/news";
import { CompanyBadge } from "@/components/company-badge";
import { NewsCategoryBadge } from "@/components/news-category-badge";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { ReleaseTime } from "@/components/release-time";

export default async function NewsPage({ params }: PageProps<"/dashboard/news/[id]">) {
  const { id } = await params;
  const news = await getNews(Number(id));
  if (!news) notFound();

  const t = await getTranslations("News");

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-6">
      <PageBreadcrumbs
        items={[
          {
            label: news.company.name,
            href: `/dashboard/company/${encodeURIComponent(news.company.ticker)}`,
          },
          { label: news.title },
        ]}
      />
      <article className="flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <ReleaseTime date={news.releasedAt} />
            <CompanyBadge company={news.company} />
            <NewsCategoryBadge category={news.category} />
          </div>
          <h1 className="text-2xl font-semibold">{news.title}</h1>
        </header>
        {/* Plain text from the release email; keep its paragraphs and line breaks. */}
        <div className="whitespace-pre-wrap break-words">{news.description}</div>
        {news.attachments.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t("attachments")}</h2>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {news.attachments.map((attachment) => (
                <li key={attachment.id}>
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-primary underline-offset-4 hover:underline"
                  >
                    {attachment.name || attachment.url}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </main>
  );
}
