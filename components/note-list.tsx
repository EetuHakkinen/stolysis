"use client";

import { useState, useTransition } from "react";
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getNoteSnapshot, type NoteItem, type NoteNews } from "@/actions/notes";
import { NoteView } from "@/components/note-view";
import { Button } from "@/components/ui/button";
import { fromLocalDate } from "@/lib/note-date";
import type { NoteSnapshot } from "@/lib/note-snapshot";

export type NoteDraft = { date: string; news: NoteNews | null; snapshot: NoteSnapshot };

// A company's notes newest first, with a new note being written on top. A new note opens from the
// button, dated today, or from a news item (initialDraft). Once it's done, the page is refreshed
// and the new note takes its place in the list.
export function NoteList({
  companyId,
  notes,
  initialDraft,
}: {
  companyId: number;
  notes: NoteItem[];
  initialDraft: NoteDraft | null;
}) {
  const t = useTranslations("Notes");
  const router = useRouter();
  // Each draft gets its own key, so a new one starts over.
  const [draft, setDraft] = useState(initialDraft && { key: 0, ...initialDraft });
  const [draftId, setDraftId] = useState<number | null>(null);
  const [draftDone, setDraftDone] = useState(false);
  const [opening, startOpening] = useTransition();

  // A finished draft is shown until the refreshed list has it.
  const showDraft = draft != null && !(draftDone && notes.some((note) => note.id === draftId));

  // A draft from a news item is in the URL; it's used once.
  function clearDraftUrl() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("newsId")) return;
    url.searchParams.delete("newsId");
    window.history.replaceState(null, "", url);
  }

  function newNote() {
    startOpening(async () => {
      const date = fromLocalDate(new Date());
      const snapshot = await getNoteSnapshot({ companyId, date });
      if (!snapshot) return;
      setDraft({ key: (draft?.key ?? 0) + 1, date, news: null, snapshot });
      setDraftId(null);
      setDraftDone(false);
    });
  }

  function draftClosed(saved: boolean) {
    clearDraftUrl();
    if (!saved) return setDraft(null);
    setDraftDone(true);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={newNote} disabled={opening || (showDraft && !draftDone)}>
          <PlusIcon />
          {t("new")}
        </Button>
      </div>
      {showDraft && (
        <NoteView
          key={`draft-${draft.key}`}
          companyId={companyId}
          note={{ id: null, text: "", date: draft.date, news: draft.news, snapshot: draft.snapshot }}
          onCreated={setDraftId}
          onDone={draftClosed}
        />
      )}
      {notes.length === 0 && !showDraft ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        notes
          .filter((note) => !showDraft || note.id !== draftId)
          .map((note) => <NoteView key={note.id} companyId={companyId} note={note} />)
      )}
    </div>
  );
}
