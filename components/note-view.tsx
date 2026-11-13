"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  createNote,
  deleteNote,
  getNoteNewsOptions,
  getNoteSnapshot,
  updateNote,
  type NoteItem,
  type NoteNews,
} from "@/actions/notes";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Markdown } from "@/components/markdown";
import { NoteMargin } from "@/components/note-margin";
import { useSelectedScenario } from "@/components/selected-scenario";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAutoSave } from "@/hooks/use-auto-save";

// A note rendered in full, with its margin taking a quarter of the width on large screens and
// following it on small ones. In edit mode the text is written in markdown with a preview, and
// saved a second after typing stops; date and news changes are saved right away. A new note
// (without id) starts in edit mode and is created on its first save with text.
export function NoteView({
  companyId,
  note,
  onCreated,
  onDone,
}: {
  companyId: number;
  note: Omit<NoteItem, "id"> & { id: number | null };
  // A new note was saved for the first time.
  onCreated?: (id: number) => void;
  // Editing ended, with whether the note is saved (a new note left empty isn't).
  onDone?: (saved: boolean) => void;
}) {
  const t = useTranslations("Notes");
  const { selectedId } = useSelectedScenario();
  // Set synchronously on creation, so saves queued before the next render update the note.
  const idRef = useRef(note.id);
  const [id, setId] = useState(note.id);
  const [editing, setEditing] = useState(note.id == null);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [text, setText] = useState(note.text);
  const [date, setDate] = useState(note.date);
  const [news, setNews] = useState(note.news);
  const [newsOptions, setNewsOptions] = useState<NoteNews[] | null>(null);
  const [snapshot, setSnapshot] = useState(note.snapshot);
  const [scenarioId, setScenarioId] = useState<number>();
  const [loading, startLoading] = useTransition();
  // Values for saving. Handlers that save right away set them before the next render.
  const values = useRef({ text, date, news });
  useEffect(() => {
    values.current = { text, date, news };
  }, [text, date, news]);

  const { status, change, saveNow, flush } = useAutoSave(async () => {
    const { text, date, news } = values.current;
    const fields = { date, text, newsId: news?.id ?? null };
    if (idRef.current != null) return (await updateNote({ noteId: idRef.current, ...fields })).saved;
    // Empty notes aren't created.
    if (text.trim() === "") return true;
    const { id } = await createNote({ companyId, ...fields });
    if (id == null) return false;
    idRef.current = id;
    setId(id);
    onCreated?.(id);
    return true;
  });

  // The scenario picked here, else the one selected on the page, else the first one with data.
  const scenario =
    snapshot.scenarios.find((item) => item.id === (scenarioId ?? selectedId)) ?? snapshot.scenarios[0];

  function loadNewsOptions() {
    getNoteNewsOptions({ companyId }).then(setNewsOptions);
  }

  // A new note opens in edit mode.
  useEffect(() => {
    if (note.id == null) loadNewsOptions();
    // Only when the note is shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEditing() {
    setEditing(true);
    setMode("write");
    if (newsOptions == null) loadNewsOptions();
  }

  async function done() {
    await flush();
    setEditing(false);
    onDone?.(idRef.current != null);
  }

  function changeText(value: string) {
    setText(value);
    values.current = { ...values.current, text: value };
    change();
  }

  function changeDate(value: string) {
    setDate(value);
    values.current = { ...values.current, date: value };
    saveNow();
    startLoading(async () => {
      const loaded = await getNoteSnapshot({ companyId, date: value });
      if (loaded) setSnapshot(loaded);
    });
  }

  function changeNews(value: NoteNews | null) {
    setNews(value);
    values.current = { ...values.current, news: value };
    saveNow();
  }

  return (
    <article className="grid grid-cols-1 gap-6 rounded-lg border p-4 lg:grid-cols-4">
      <div className="flex min-w-0 flex-col gap-3 lg:col-span-3">
        {editing ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Tabs value={mode} onValueChange={(value) => setMode(value)}>
                <TabsList>
                  <TabsTrigger value="write" className="px-3">
                    {t("write")}
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="px-3">
                    {t("preview")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {id == null && text.trim() === "" ? t("status.empty") : t(`status.${status}`)}
              </span>
            </div>
            {mode === "write" ? (
              <Textarea
                value={text}
                onChange={(e) => changeText(e.target.value)}
                placeholder={t("placeholder")}
                aria-label={t("text")}
                autoFocus
                className="min-h-64 font-mono"
              />
            ) : text.trim() === "" ? (
              <p className="min-h-64 text-muted-foreground">{t("nothingToPreview")}</p>
            ) : (
              <div className="min-h-64">
                <Markdown>{text}</Markdown>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {id != null ? (
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="sm">
                      <Trash2Icon />
                      {t("delete")}
                    </Button>
                  }
                  title={t("deleteTitle")}
                  description={t("deleteDescription")}
                  confirmLabel={t("delete")}
                  pendingLabel={t("deleting")}
                  destructive
                  confirm={async () => {
                    await flush();
                    await deleteNote({ noteId: id });
                  }}
                />
              ) : (
                <span />
              )}
              <Button size="sm" onClick={done}>
                {t("done")}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {text.trim() === "" ? <p className="text-muted-foreground">{t("emptyNote")}</p> : <Markdown>{text}</Markdown>}
            </div>
            <Button variant="ghost" size="icon-sm" aria-label={t("edit")} title={t("edit")} onClick={startEditing}>
              <PencilIcon />
            </Button>
          </div>
        )}
      </div>
      <div className="lg:border-l lg:pl-4">
        <NoteMargin
          editing={editing}
          date={date}
          onDateChange={changeDate}
          news={news}
          newsOptions={newsOptions}
          onNewsChange={changeNews}
          snapshot={snapshot}
          scenario={scenario}
          onScenarioSelect={setScenarioId}
          loading={loading}
        />
      </div>
    </article>
  );
}
