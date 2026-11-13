"use client";

import Link from "next/link";
import { XIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { NoteNews } from "@/actions/notes";
import type { Unit } from "@/app/generated/prisma/client";
import { DatePicker } from "@/components/date-picker";
import { EstimateScenarioPicker } from "@/components/estimate-scenario-picker";
import { FormattedValue } from "@/components/period-table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIME_ZONE } from "@/lib/helsinki-time";
import { toLocalDate } from "@/lib/note-date";
import type { NoteSnapshot, NoteSnapshotScenario } from "@/lib/note-snapshot";
import { PRICE_FORMAT } from "@/lib/stock-price";

function MarginSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="text-xs font-medium text-muted-foreground uppercase">{title}</h4>
      {children}
    </section>
  );
}

// Information beside a note: its date and linked news, which can be changed while editing, and
// the company's closing price on the date, and its starred fields at the end of the date in the
// selected scenario with the multiples the price gives.
export function NoteMargin({
  editing,
  date,
  onDateChange,
  news,
  newsOptions,
  onNewsChange,
  snapshot,
  scenario,
  onScenarioSelect,
  loading,
}: {
  editing: boolean;
  date: string;
  onDateChange: (date: string) => void;
  news: NoteNews | null;
  // Null until loaded.
  newsOptions: NoteNews[] | null;
  onNewsChange: (news: NoteNews | null) => void;
  snapshot: NoteSnapshot;
  scenario: NoteSnapshotScenario;
  onScenarioSelect: (scenarioId: number | undefined) => void;
  // The snapshot is being loaded for a new date.
  loading: boolean;
}) {
  const t = useTranslations("Notes");
  const format = useFormatter();
  const scenarios = snapshot.scenarios.flatMap((item) =>
    item.id == null ? [] : [{ id: item.id, name: item.name ?? "" }],
  );

  return (
    <aside className="flex flex-col gap-5 text-sm">
      <MarginSection title={t("date")}>
        {editing ? (
          <DatePicker value={date} onChange={onDateChange} label={t("date")} />
        ) : (
          <time dateTime={date}>{format.dateTime(toLocalDate(date), { dateStyle: "medium" })}</time>
        )}
      </MarginSection>

      {(editing || news) && (
        <MarginSection title={t("news")}>
          {news && (
            <div className="flex items-start gap-1">
              <Link href={`/dashboard/news/${news.id}`} className="flex-1 hover:underline">
                <span className="block text-xs text-muted-foreground">
                  {format.dateTime(news.releasedAt, { dateStyle: "medium", timeZone: TIME_ZONE })}
                </span>
                {news.title}
              </Link>
              {editing && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("removeNews")}
                  title={t("removeNews")}
                  onClick={() => onNewsChange(null)}
                >
                  <XIcon />
                </Button>
              )}
            </div>
          )}
          {editing && <NewsPicker news={news} options={newsOptions} onChange={onNewsChange} />}
        </MarginSection>
      )}

      <div className={loading ? "flex flex-col gap-5 opacity-60" : "flex flex-col gap-5"}>
        {snapshot.stockPrice && (
          <MarginSection title={t("stockPrice")}>
            <div className="flex items-baseline justify-between gap-2 tabular-nums">
              <span>{format.number(snapshot.stockPrice.close, PRICE_FORMAT)}</span>
              {/* The price is from an earlier trading day when there was no trading on the date. */}
              {snapshot.stockPrice.date !== date && (
                <time dateTime={snapshot.stockPrice.date} className="text-xs text-muted-foreground">
                  {format.dateTime(toLocalDate(snapshot.stockPrice.date), { dateStyle: "medium" })}
                </time>
              )}
            </div>
          </MarginSection>
        )}

        {scenarios.length > 1 && (
          <EstimateScenarioPicker
            scenarios={scenarios}
            selected={scenarios.find((item) => item.id === scenario.id)}
            onSelect={onScenarioSelect}
          />
        )}

        {snapshot.fields.length > 0 && (
          <MarginSection title={t("estimates")}>
            {snapshot.years.length === 0 ? (
              <p className="text-muted-foreground">{t("noYear")}</p>
            ) : (
              <YearValues
                snapshot={snapshot}
                scenario={scenario}
                showUnits
                rows={snapshot.fields.map((field) => ({
                  id: field.id,
                  name: field.name,
                  value: (yearId, unit) => (
                    <FormattedValue
                      value={scenario.values[field.id]?.[yearId]?.value}
                      unit={unit}
                      valueFormat={field.valueFormat}
                    />
                  ),
                }))}
              />
            )}
          </MarginSection>
        )}

        {snapshot.stockPrice && snapshot.years.length > 0 && snapshot.multiples.length > 0 && (
          <MarginSection title={t("multiples")}>
            <YearValues
              snapshot={snapshot}
              scenario={scenario}
              rows={snapshot.multiples.map((multiple) => ({
                id: multiple.id,
                name: multiple.name,
                value: (yearId) => {
                  const value = scenario.multiples[multiple.id]?.[yearId];
                  return value == null
                    ? "–"
                    : format.number(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
                },
              }))}
            />
          </MarginSection>
        )}
      </div>
    </aside>
  );
}

// Rows of yearly values, such as the starred fields' values, each row's name above its values to
// fit the narrow margin. A year is marked estimated if any starred field's value in it is.
function YearValues({
  snapshot,
  scenario,
  rows,
  showUnits = false,
}: {
  snapshot: NoteSnapshot;
  scenario: NoteSnapshotScenario;
  rows: { id: number; name: string | null; value: (yearId: number, unit: Unit) => React.ReactNode }[];
  // Show each year's unit under its name.
  showUnits?: boolean;
}) {
  const t = useTranslations("Results");
  const columns = `repeat(${snapshot.years.length}, minmax(0, 1fr))`;

  return (
    <div className="flex flex-col gap-1.5 tabular-nums">
      <div className="grid gap-x-2 border-b pb-1 text-right text-xs" style={{ gridTemplateColumns: columns }}>
        {snapshot.years.map((year) => {
          const estimated = snapshot.fields.some(
            (field) => scenario.values[field.id]?.[year.id]?.source === "estimate",
          );
          return (
            <div key={year.id}>
              <div className="font-medium">{`${year.name ?? ""}${estimated ? "e" : ""}`}</div>
              {showUnits && <div className="text-muted-foreground">{t(`units.${year.unit}`)}</div>}
            </div>
          );
        })}
      </div>
      {rows.map((row) => (
        <div key={row.id}>
          <div className="text-xs text-muted-foreground">{row.name}</div>
          <div className="grid gap-x-2 text-right" style={{ gridTemplateColumns: columns }}>
            {snapshot.years.map((year) => (
              <div key={year.id}>{row.value(year.id, year.unit)}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Select for the news the note is linked to, newest first.
function NewsPicker({
  news,
  options,
  onChange,
}: {
  news: NoteNews | null;
  options: NoteNews[] | null;
  onChange: (news: NoteNews | null) => void;
}) {
  const t = useTranslations("Notes");
  const format = useFormatter();
  const items = (options ?? []).map((option) => ({
    value: option.id,
    label: `${format.dateTime(option.releasedAt, { dateStyle: "short", timeZone: TIME_ZONE })} ${option.title}`,
  }));

  return (
    <Select
      items={items}
      // Only picks another news item: the linked one is shown above.
      value={null}
      onValueChange={(value) => onChange(options?.find((option) => option.id === value) ?? null)}
      disabled={options == null}
    >
      <SelectTrigger className="w-full" aria-label={t("selectNews")}>
        <SelectValue placeholder={news ? t("changeNews") : t("selectNews")} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            <span className="line-clamp-2">{item.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
