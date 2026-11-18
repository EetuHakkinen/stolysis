"use client";

import { useState, useTransition } from "react";
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { generatePeriodNote, type GeneratePeriodNoteError } from "@/actions/notes";
import { Button } from "@/components/ui/button";

// Button that writes an AI note on the period of a report news item, shown among its notes once
// written. Writing takes about a minute, as the report is read in full.
export function GeneratePeriodNoteButton({ newsId }: { newsId: number }) {
  const t = useTranslations("Notes.generate");
  const [error, setError] = useState<GeneratePeriodNoteError>();
  const [pending, startTransition] = useTransition();

  function generate() {
    setError(undefined);
    startTransition(async () => {
      const result = await generatePeriodNote({ newsId });
      setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={generate} disabled={pending}>
        <SparklesIcon />
        {pending ? t("generating") : t("button")}
      </Button>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {t(`errors.${error}`)}
        </p>
      )}
    </div>
  );
}
