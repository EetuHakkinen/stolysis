import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { NotebookPenIcon } from "lucide-react";
import { getNews } from "@/actions/news";
import { getNotesForNews } from "@/actions/notes";
import { ButtonLink } from "@/components/button-link";
import { CompanyBadge } from "@/components/company-badge";
import { Markdown } from "@/components/markdown";
import { NewsCategoryBadge } from "@/components/news-category-badge";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { ReleaseTime } from "@/components/release-time";
import { toDbDate } from "@/lib/note-date";

export default async function NewsPage({ params }: PageProps<"/dashboard/news/[id]">) {
  const { id } = await params;
  const news = await getNews(Number(id));
  if (!news) notFound();

  const [t, tNotes, notes] = await Promise.all([
    getTranslations("News"),
    getTranslations("Notes"),
    getNotesForNews({ newsId: news.id }),
  ]);
  const format = await getFormatter();
  const companyPath = `/dashboard/company/${encodeURIComponent(news.company.ticker)}`;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-6">
      <PageBreadcrumbs
        items={[
          {
            label: news.company.name,
            href: companyPath,
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
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{tNotes("title")}</h2>
          <ButtonLink href={`${companyPath}?tab=notes&newsId=${news.id}`} variant="outline" size="sm">
            <NotebookPenIcon />
            {tNotes("createFromNews")}
          </ButtonLink>
        </div>
        {notes.length === 0 ? (
          <p className="text-muted-foreground">{tNotes("noneForNews")}</p>
        ) : (
          notes.map((note) => (
            <article key={note.id} className="flex flex-col gap-2 rounded-lg border p-4">
              <time dateTime={note.date} className="text-sm text-muted-foreground">
                {format.dateTime(toDbDate(note.date), { dateStyle: "medium", timeZone: "UTC" })}
              </time>
              <Markdown>{note.text}</Markdown>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
