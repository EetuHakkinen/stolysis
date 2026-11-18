"use client";

import { useState } from "react";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { CompanyDraftSettings } from "@/lib/company-draft";
import {
  applyFieldSuggestion,
  applySuggestedChange,
  type NewFieldIds,
  type SuggestionResult,
} from "@/lib/company-draft-suggestions";
import { formatFormula, type Formula } from "@/lib/formulas";
import type { FieldSuggestion, SuggestedChange, SuggestionFieldRef } from "@/lib/report-check-api";

type Applied = Extract<SuggestionResult, { ok: true }>;

// The suggested changes to the fields of a company being created that its reports don't have, each
// with a button to apply it to the draft. A deletion lists what else changes with it, as the
// formulas using the deleted field have to change too; changes can be left out, unless the field
// would still be used. A rename's changes to other fields can be applied once it has been applied,
// as can the changes left out of a deletion.
export function FieldSuggestions({
  suggestions,
  settings,
  applied,
  newFieldIds,
  onApply,
}: {
  suggestions: FieldSuggestion[];
  settings: CompanyDraftSettings;
  // Ids of the suggestions and changes applied.
  applied: string[];
  newFieldIds: NewFieldIds;
  // ids: the suggestion and the changes applied with it, or a change applied afterwards.
  onApply: (ids: string[], result: Applied) => void;
}) {
  const t = useTranslations("ReportCheck");

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <h3 className="font-semibold">{t("suggestionsTitle")}</h3>
      <p className="text-sm text-muted-foreground">{t("suggestionsDescription")}</p>
      <ul className="flex flex-col divide-y">
        {suggestions.map((suggestion) => (
          <SuggestionItem
            key={suggestion.id}
            suggestion={suggestion}
            settings={settings}
            applied={applied}
            newFieldIds={newFieldIds}
            onApply={onApply}
          />
        ))}
      </ul>
    </div>
  );
}

function SuggestionItem({
  suggestion,
  settings,
  applied,
  newFieldIds,
  onApply,
}: {
  suggestion: FieldSuggestion;
  settings: CompanyDraftSettings;
  applied: string[];
  newFieldIds: NewFieldIds;
  onApply: (ids: string[], result: Applied) => void;
}) {
  const t = useTranslations("ReportCheck");
  // Changes left out of a deletion; all are applied with it by default.
  const [leftOut, setLeftOut] = useState<string[]>([]);
  const isApplied = applied.includes(suggestion.id);
  const withDeletion = suggestion.action === "delete" ? suggestion.changes : [];
  const changeIds = withDeletion.filter((change) => !leftOut.includes(change.id)).map((change) => change.id);
  const result = isApplied ? undefined : applyFieldSuggestion(settings, suggestion, changeIds);
  // New fields by key: those of this suggestion, before or after it's applied.
  const newFieldNames = new Map(
    suggestion.action === "delete" ? suggestion.newFields.map((field) => [field.key, field.name]) : [],
  );
  const remaining = isApplied ? suggestion.changes.filter((change) => !applied.includes(change.id)) : [];

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={suggestion.action === "delete" ? "destructive" : "secondary"}>
              {t(suggestion.action === "delete" ? "deleteSuggestion" : "renameSuggestion")}
            </Badge>
            {suggestion.action === "rename" ? (
              <span className="flex flex-wrap items-center gap-1">
                <span>{suggestion.fieldName}</span>
                <ArrowRightIcon className="size-4 text-muted-foreground" aria-hidden />
                <span className="font-medium">{suggestion.name}</span>
              </span>
            ) : (
              <span className="font-medium line-through">{suggestion.fieldName}</span>
            )}
          </div>
          {suggestion.action === "delete" && suggestion.newFields.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-sm">
              <span className="text-muted-foreground">{t("replacedWith")}</span>
              {suggestion.newFields.map((field) => (
                <Badge key={field.key} variant="outline">
                  {field.name}
                </Badge>
              ))}
            </div>
          )}
          {suggestion.reason && <p className="text-sm text-muted-foreground">{suggestion.reason}</p>}
        </div>
        {isApplied ? (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <CheckIcon className="size-4" />
            {t("applied")}
          </span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={!result?.ok}
            onClick={() => result?.ok && onApply([suggestion.id, ...changeIds], result)}
          >
            {t("apply")}
          </Button>
        )}
      </div>

      {!isApplied && withDeletion.length > 0 && (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-muted-foreground">{t("deleteChanges")}</p>
          <ul className="flex flex-col gap-2">
            {withDeletion.map((change) => {
              const id = `suggested-change-${change.id}`;
              return (
                <li key={change.id} className="flex items-start gap-2">
                  <Checkbox
                    id={id}
                    className="mt-0.5"
                    checked={!leftOut.includes(change.id)}
                    onCheckedChange={(checked) =>
                      setLeftOut((ids) => (checked ? ids.filter((other) => other !== change.id) : [...ids, change.id]))
                    }
                  />
                  <label htmlFor={id}>
                    <ChangeDescription change={change} settings={settings} newFieldNames={newFieldNames} />
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {result && !result.ok && <SuggestionProblem result={result} settings={settings} />}

      {remaining.length > 0 && (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-muted-foreground">{t("followUpChanges")}</p>
          <ul className="flex flex-col gap-2">
            {remaining.map((change) => {
              const changeResult = applySuggestedChange(settings, change, newFieldIds);
              return (
                <li key={change.id} className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <ChangeDescription change={change} settings={settings} newFieldNames={newFieldNames} />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!changeResult.ok}
                      onClick={() => changeResult.ok && onApply([change.id], changeResult)}
                    >
                      {t("apply")}
                    </Button>
                  </div>
                  {!changeResult.ok && <SuggestionProblem result={changeResult} settings={settings} />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </li>
  );
}

const draftFieldNames = (settings: CompanyDraftSettings) =>
  new Map(settings.groups.flatMap((group) => group.fields.map((field) => [field.id, field.name] as const)));

// Why a suggestion or change can't be applied.
function SuggestionProblem({
  result,
  settings,
}: {
  result: Exclude<SuggestionResult, { ok: true }>;
  settings: CompanyDraftSettings;
}) {
  const t = useTranslations("ReportCheck");
  if (result.reason !== "stillUsed")
    return (
      <p className="text-sm text-destructive">
        {t(result.reason === "stale" ? "suggestionStale" : "suggestionInvalid")}
      </p>
    );
  const names = draftFieldNames(settings);
  return (
    <p className="text-sm text-destructive">
      {t("stillUsed", { fields: result.fieldIds.map((id) => names.get(id) ?? "").join(", ") })}
    </p>
  );
}

// What the change does, e.g. "Liikevoitto-%: toteuman kaava (Liikevoitto ÷ Liikevaihto) × 100 →
// (Liikevoitto ÷ Liiketoiminnan tuotot) × 100", with the fields' current names.
function ChangeDescription({
  change,
  settings,
  newFieldNames,
}: {
  change: SuggestedChange;
  settings: CompanyDraftSettings;
  newFieldNames: Map<string, string>;
}) {
  const t = useTranslations("ReportCheck");
  const tFormula = useTranslations("FormulaEditor");
  const format = useFormatter();
  const names = draftFieldNames(settings);
  const fieldName = names.get(change.fieldId) ?? change.fieldName;

  const formatted = (formula: Formula<SuggestionFieldRef>) =>
    formatFormula(formula, {
      field: (ref, period) => {
        const name = (typeof ref === "number" ? names.get(ref) : newFieldNames.get(ref)) ?? tFormula("unknownField");
        return period === "previous" ? tFormula("previousValue", { name }) : name;
      },
      number: (value) => format.number(value, { maximumFractionDigits: 10 }),
    });

  if (change.action === "delete") return <span>{t("deleteField", { name: fieldName })}</span>;
  if (change.action === "rename")
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <span>{fieldName}</span>
        <ArrowRightIcon className="size-4 text-muted-foreground" aria-hidden />
        <span className="font-medium">{change.name}</span>
      </span>
    );

  const field = settings.groups.flatMap((group) => group.fields).find((candidate) => candidate.id === change.fieldId);
  const current = change.kind === "actual" ? field?.actualDefinition : field?.estimateDefinition;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="font-medium">
        {fieldName}, {t(change.kind === "actual" ? "actualFormula" : "estimateFormula")}:
      </span>
      {current && <span className="text-muted-foreground line-through">{formatted(current)}</span>}
      <ArrowRightIcon className="size-4 text-muted-foreground" aria-hidden />
      <span>{change.formula ? formatted(change.formula) : t("formulaRemoved")}</span>
    </span>
  );
}
