import type { NotesPage } from "@/actions/notes";
import { NoteList, type NoteDraft } from "@/components/note-list";
import { Pagination } from "@/components/pagination";

// A page of a company's notes, each with the company's estimates at the time beside it.
export function CompanyNotes({
  companyId,
  feed: { notes, page, pageCount },
  draft,
  pageHref,
}: {
  companyId: number;
  feed: NotesPage;
  draft: NoteDraft | null;
  pageHref: (page: number) => string;
}) {
  return (
    <section className="flex flex-col gap-4">
      <NoteList companyId={companyId} notes={notes} initialDraft={draft} />
      <Pagination page={page} pageCount={pageCount} href={pageHref} />
    </section>
  );
}
