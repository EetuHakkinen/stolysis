"use client";

import { useEffect, useState, useTransition } from "react";
import { PencilIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { saveResults, type ResultGroup } from "@/actions/results";
import type { Unit, ValueFormat } from "@/app/generated/prisma/client";
import type { EstimatePeriod } from "@/components/estimate-table";
import { FormattedValue, PeriodTable } from "@/components/period-table";
import { ResultTable, type ResultColumn } from "@/components/result-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PeriodValue } from "@/lib/estimates";
import { parseNumber } from "@/lib/parse-number";
import { UNIT_DIVISORS } from "@/lib/units";

type EditedField = ResultGroup["fields"][number];

function cellKey(fieldId: number, column: ResultColumn) {
  return `${fieldId}:${column.key}`;
}

// Saved value of the field for the column's period.
function savedValue(field: EditedField, { period }: ResultColumn) {
  return period.reportingSeasonId != null
    ? field.values[period.reportingSeasonId]
    : field.yearlyValues[period.financialYearId!];
}

// Money is typed in the column's unit and stored in whole euros; percents are stored as is. Both are
// stored as whole numbers.
function divisor(unit: Unit, valueFormat: ValueFormat) {
  return valueFormat === "money" ? UNIT_DIVISORS[unit] : 1;
}

// The result tables of reporting seasons or financial years, with an edit mode for the actual values
// of the cells that are editable, e.g. ended seasons. While editing, the values are typed into
// inputs and kept in state; saving stores the changed ones as new result rows and marks their
// periods confirmed. Leaving the page with unsaved changes asks first.
export function ResultEditor({
  companyId,
  groups,
  columns,
  values,
  editable,
  description,
}: {
  companyId: number;
  groups: ResultGroup[];
  // One column per reporting season or per financial year.
  columns: ResultColumn[];
  values: (fieldId: number, period: EstimatePeriod) => PeriodValue | undefined;
  // Whether the field's result for the column's period can be edited.
  editable: (field: EditedField, column: ResultColumn) => boolean;
  // Which values can be edited, shown while editing.
  description: string;
}) {
  const t = useTranslations("ResultEditor");
  const format = useFormatter();
  const [editing, setEditing] = useState(false);
  // Typed text by cell key; cells not typed in show their saved value.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<"invalid" | "saveFailed">();
  const [pending, startTransition] = useTransition();

  const fields = groups.flatMap((group) => group.fields);
  const canEdit = fields.some((field) => columns.some((column) => editable(field, column)));

  function savedText(field: EditedField, column: ResultColumn) {
    const value = savedValue(field, column);
    if (value == null) return "";
    return format.number(Number(value) / divisor(column.unit, field.valueFormat), {
      maximumFractionDigits: 6,
      useGrouping: false,
    });
  }

  // Cells whose typed value differs from the saved one, in whole euros, or "invalid" for text that
  // isn't a number.
  function changes() {
    const changed: (EstimatePeriod & { resultFieldId: number; value: number | null })[] = [];
    const invalid = new Set<string>();
    for (const field of fields) {
      for (const column of columns) {
        const key = cellKey(field.id, column);
        const text = drafts[key];
        if (text === undefined) continue;
        const parsed = parseNumber(text);
        if (parsed === undefined) {
          invalid.add(key);
          continue;
        }
        const value = parsed == null ? null : Math.round(parsed * divisor(column.unit, field.valueFormat));
        const saved = savedValue(field, column);
        const same = saved == null ? value == null : value != null && BigInt(value) === saved;
        if (!same) changed.push({ ...column.period, resultFieldId: field.id, value });
      }
    }
    return { changed, invalid };
  }

  const { changed, invalid } = changes();
  const dirty = changed.length > 0 || invalid.size > 0;

  useEffect(() => {
    if (!editing || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editing, dirty]);

  function stopEditing() {
    setEditing(false);
    setDrafts({});
    setError(undefined);
  }

  function save() {
    if (invalid.size > 0) return setError("invalid");
    if (changed.length === 0) return stopEditing();
    startTransition(async () => {
      const { saved } = await saveResults({ companyId, values: changed });
      if (saved) stopEditing();
      else setError("saveFailed");
    });
  }

  if (!editing) {
    return (
      <>
        {canEdit && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <PencilIcon data-icon="inline-start" />
              {t("edit")}
            </Button>
          </div>
        )}
        {groups.map((group) => (
          <ResultTable key={group.id} name={group.name} fields={group.fields} columns={columns} values={values} />
        ))}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p className="mr-auto text-sm text-muted-foreground">{description}</p>
        {error && <p className="text-sm text-destructive">{t(`errors.${error}`)}</p>}
        <Button variant="outline" size="sm" onClick={stopEditing} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
      {groups.map((group) => (
        <PeriodTable
          key={group.id}
          name={group.name}
          fields={group.fields}
          columns={columns}
          scrollFromEnd
          cell={(field, column) => {
            if (!editable(field, column)) {
              return (
                <FormattedValue
                  value={values(field.id, column.period)?.value}
                  unit={column.unit}
                  valueFormat={field.valueFormat}
                />
              );
            }
            const key = cellKey(field.id, column);
            return (
              <div className="flex items-center justify-end gap-1">
                <Input
                  value={drafts[key] ?? savedText(field, column)}
                  onChange={(e) => setDrafts((drafts) => ({ ...drafts, [key]: e.target.value }))}
                  inputMode="decimal"
                  aria-label={`${field.name ?? ""} ${column.label}`}
                  aria-invalid={invalid.has(key)}
                  disabled={pending}
                  className="h-7 w-24 text-right tabular-nums"
                />
                {field.valueFormat === "percent" && <span className="text-xs text-muted-foreground">%</span>}
              </div>
            );
          }}
        />
      ))}
    </>
  );
}
