"use client";

import { useState, useTransition } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { addNewsFromUrls, type AddNewsResult } from "@/actions/news";
import { InvestorCallForm } from "@/components/investor-call-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { MAX_NEWS_URLS, parseNewsUrls } from "@/lib/news-urls";

type AddNewsTab = "urls" | "investorCall";

// + button that opens a dialog for adding news, either by URL (release pages or PDF reports) or as
// an investor call transcript. The feed refreshes once news are saved. `companyId` preselects the
// company of an investor call, e.g. in a company's own feed.
export function AddNewsDialog({
  companies,
  companyId,
}: {
  companies: { id: number; name: string }[];
  companyId?: number;
}) {
  const t = useTranslations("AddNews");
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AddNewsTab>("urls");

  // The forms are unmounted when the dialog closes, which clears them.
  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) setTab("urls");
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("open")} />}>
        <PlusIcon />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(value: AddNewsTab) => setTab(value)}>
          <TabsList className="w-full">
            <TabsTrigger value="urls">{t("tabs.urls")}</TabsTrigger>
            <TabsTrigger value="investorCall">{t("tabs.investorCall")}</TabsTrigger>
          </TabsList>
          <TabsContent value="urls">
            <AddNewsUrlForm onSaved={() => setOpen(false)} />
          </TabsContent>
          <TabsContent value="investorCall">
            <InvestorCallForm
              companies={companies}
              companyId={companyId}
              onSaved={() => setOpen(false)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// URLs one per line; URLs that fail stay in the field with their errors.
function AddNewsUrlForm({ onSaved }: { onSaved: () => void }) {
  const t = useTranslations("AddNews");
  const [text, setText] = useState("");
  const [error, setError] = useState<"required" | "tooMany">();
  const [results, setResults] = useState<AddNewsResult[]>([]);
  const [pending, startTransition] = useTransition();

  const failed = results.filter((result) => !result.saved);
  const savedCount = results.length - failed.length;

  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const urls = parseNewsUrls(text);
    if (urls.length === 0) return setError("required");
    if (urls.length > MAX_NEWS_URLS) return setError("tooMany");
    setError(undefined);
    setResults([]);

    startTransition(async () => {
      const results = await addNewsFromUrls({ urls });
      const failed = results.filter((result) => !result.saved);
      if (failed.length === 0) return onSaved();
      setResults(results);
      setText(failed.map((result) => result.url).join("\n"));
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogDescription>{t("description", { max: MAX_NEWS_URLS })}</DialogDescription>
      <FieldGroup>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="news-urls">{t("urls")}</FieldLabel>
          <Textarea
            id="news-urls"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="https://…"
            rows={5}
            aria-invalid={!!error}
            disabled={pending}
            className="max-h-64 font-mono text-xs break-all"
          />
          <FieldError errors={error && [{ message: t(`errors.${error}`, { max: MAX_NEWS_URLS }) }]} />
        </Field>
      </FieldGroup>
      {results.length > 0 && (
        <div className="flex flex-col gap-2 text-sm">
          {savedCount > 0 && <p>{t("saved", { count: savedCount })}</p>}
          <ul className="flex flex-col gap-1 text-destructive">
            {failed.map((result) => (
              <li key={result.url} className="break-all">
                <span className="font-mono text-xs">{result.url}</span>: {t(`errors.${result.error}`)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{t("cancel")}</DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
