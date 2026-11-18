"use client";

import { useState, useTransition } from "react";
import { ChevronRightIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, PencilIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { BusinessAnalysisCategory } from "@/app/generated/prisma/enums";
import { saveBusinessAnalysis, type BusinessAnalysisVersion } from "@/actions/business-analysis";
import { BusinessAnalysisHistory } from "@/components/business-analysis-history";
import { BusinessAnalysisSource } from "@/components/business-analysis-source";
import { Markdown } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BUSINESS_ANALYSIS_CATEGORIES } from "@/lib/business-analysis-sections";
import { cn } from "@/lib/utils";

// A company's business analysis, a collapsible section per category, all open at first, with
// buttons to open and collapse them all and to view the history of changes. Each section can be
// edited by hand.
export function BusinessAnalysis({
  companyId,
  sections,
}: {
  companyId: number;
  // The current version of each section that has one.
  sections: BusinessAnalysisVersion[];
}) {
  const t = useTranslations("BusinessAnalysis");
  const [open, setOpen] = useState<Set<BusinessAnalysisCategory>>(() => new Set(BUSINESS_ANALYSIS_CATEGORIES));

  function toggle(category: BusinessAnalysisCategory, isOpen: boolean) {
    setOpen((current) => {
      const next = new Set(current);
      if (isOpen) next.add(category);
      else next.delete(category);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(new Set(BUSINESS_ANALYSIS_CATEGORIES))}>
            <ChevronsUpDownIcon />
            {t("openAll")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOpen(new Set())}>
            <ChevronsDownUpIcon />
            {t("collapseAll")}
          </Button>
          <BusinessAnalysisHistory companyId={companyId} />
        </div>
      </div>
      {BUSINESS_ANALYSIS_CATEGORIES.map((category) => (
        <BusinessAnalysisSection
          key={category}
          companyId={companyId}
          category={category}
          version={sections.find((section) => section.category === category) ?? null}
          open={open.has(category)}
          onOpenChange={(isOpen) => toggle(category, isOpen)}
        />
      ))}
    </div>
  );
}

// Error values are translation keys under BusinessAnalysis.errors.
type SaveError = "empty" | "changed" | "failed";

// A section of the business analysis. In edit mode its text is written in markdown with a preview,
// and saved as a new version only with the save button: versions are never changed, so there's no
// saving while typing.
function BusinessAnalysisSection({
  companyId,
  category,
  version,
  open,
  onOpenChange,
}: {
  companyId: number;
  category: BusinessAnalysisCategory;
  version: BusinessAnalysisVersion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("BusinessAnalysis");
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  // The version being edited, to check that the section wasn't changed meanwhile.
  const [baseId, setBaseId] = useState<number | null>(null);
  const [error, setError] = useState<SaveError>();
  const [saving, startSaving] = useTransition();
  const title = t(`categories.${category}`);

  function startEditing() {
    setText(version?.content ?? "");
    setBaseId(version?.id ?? null);
    setError(undefined);
    setEditing(true);
    onOpenChange(true);
  }

  function save() {
    startSaving(async () => {
      try {
        const result = await saveBusinessAnalysis({ companyId, category, content: text, baseId });
        if (result.saved || result.reason === "unchanged") setEditing(false);
        else setError(result.reason);
      } catch (error) {
        console.error(error);
        setError("failed");
      }
    });
  }

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="rounded-lg border">
      <div className="flex items-center gap-2 p-3">
        {/* The source links to its news, so it's beside the trigger instead of inside it. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <CollapsibleTrigger className="flex items-center gap-2 text-left font-semibold">
            <ChevronRightIcon
              className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
            />
            {title}
          </CollapsibleTrigger>
          {version && <BusinessAnalysisSource version={version} />}
        </div>
        {!editing && (
          <Button variant="ghost" size="icon-sm" aria-label={t("edit")} title={t("edit")} onClick={startEditing}>
            <PencilIcon />
          </Button>
        )}
      </div>
      <CollapsibleContent className="flex flex-col gap-3 px-4 pb-4">
        {editing ? (
          <>
            <MarkdownEditor value={text} onChange={setText} label={title} placeholder={t("placeholder")} />
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {t(`errors.${error}`)}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                {t("cancel")}
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? t("saving") : t("save")}
              </Button>
            </div>
          </>
        ) : version ? (
          <Markdown>{version.content}</Markdown>
        ) : (
          <p className="text-muted-foreground">{t("empty")}</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
