"use client";

import { useEffect, useState, useTransition } from "react";
import { PencilIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { saveResults, type ResultGroup, type ResultSeason } from "@/actions/results";
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

function cellKey(fieldId: number, seasonId: number) {
  return `${fieldId}:${seasonId}`;
}

// Money is typed in the column's unit and stored in whole euros; percents are stored as is. Both are
// stored as whole numbers.
function divisor(unit: Unit, valueFormat: ValueFormat) {
  return valueFormat === "money" ? UNIT_DIVISORS[unit] : 1;
}

// The quarterly result tables, with an edit mode for the actual values of ended reporting seasons.
// While editing, the values are typed into inputs and kept in state; saving stores the changed ones
// as new result rows and marks their seasons confirmed. Fields calculated from other fields and
// seasons that haven't ended stay read-only. Leaving the page with unsaved changes asks first.
export function ResultEditor({
  companyId,
  seasons,
  groups,
  columns,
  values,
}: {
  companyId: number;
  seasons: ResultSeason[];
  groups: ResultGroup[];
  // Quarterly columns: one per reporting season.
  columns: ResultColumn[];
  values: (fieldId: number, period: EstimatePeriod) => PeriodValue | undefined;
}) {
  const t = useTranslations("ResultEditor");
  const format = useFormatter();
  const [editing, setEditing] = useState(false);
  // Typed text by cell key; cells not typed in show their saved value.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<"invalid" | "saveFailed">();
  const [pending, startTransition] = useTransition();

  const ended = new Set(seasons.filter((season) => season.ended).map((season) => season.id));
  const units = new Map(columns.map((column) => [column.period.reportingSeasonId!, column.unit]));
  const fields = new Map(groups.flatMap((group) => group.fields.map((field) => [field.id, field])));

  function savedText(field: EditedField, seasonId: number) {
    const value = field.values[seasonId];
    if (value == null) return "";
    return format.number(Number(value) / divisor(units.get(seasonId)!, field.valueFormat), {
      maximumFractionDigits: 6,
      useGrouping: false,
    });
  }

  // Cells whose typed value differs from the saved one, in whole euros, or "invalid" for text that
  // isn't a number.
  function changes() {
    const changed: { reportingSeasonId: number; resultFieldId: number; value: number | null }[] = [];
    const invalid = new Set<string>();
    for (const [key, text] of Object.entries(drafts)) {
      const [fieldId, seasonId] = key.split(":").map(Number);
      const field = fields.get(fieldId)!;
      const parsed = parseNumber(text);
      if (parsed === undefined) {
        invalid.add(key);
        continue;
      }
      const value = parsed == null ? null : Math.round(parsed * divisor(units.get(seasonId)!, field.valueFormat));
      const saved = field.values[seasonId];
      const same = saved == null ? value == null : value != null && BigInt(value) === saved;
      if (!same) changed.push({ reportingSeasonId: seasonId, resultFieldId: fieldId, value });
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
        {ended.size > 0 && (
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
        <p className="mr-auto text-sm text-muted-foreground">{t("description")}</p>
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
            const seasonId = column.period.reportingSeasonId!;
            if (field.calculated || !ended.has(seasonId)) {
              return (
                <FormattedValue
                  value={values(field.id, column.period)?.value}
                  unit={column.unit}
                  valueFormat={field.valueFormat}
                />
              );
            }
            const key = cellKey(field.id, seasonId);
            return (
              <div className="flex items-center justify-end gap-1">
                <Input
                  value={drafts[key] ?? savedText(field, seasonId)}
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
