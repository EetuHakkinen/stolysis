import { getFormatter, getTranslations } from "next-intl/server";
import type { CompanyResults, ResultGroup, ResultSeason } from "@/actions/results";
import type { Unit } from "@/app/generated/prisma/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const UNIT_DIVISORS: Record<Unit, number> = { million: 1_000_000, thousand: 1_000, one: 1 };

// A table column: the sum of the given reporting seasons, shown in the given unit.
type ResultColumn = { key: string; label: string; unit: Unit; seasonIds: number[] };

// Values are stored in whole euros; financial years without a unit are shown in euros.
function seasonUnit(season: ResultSeason): Unit {
  return season.financialYear.unit ?? "one";
}

// One column per reporting season.
function quarterlyColumns(seasons: ResultSeason[]): ResultColumn[] {
  return seasons.map((season) => ({
    key: String(season.id),
    label: `${season.name ?? ""} ${season.financialYear.name ?? ""}`.trim(),
    unit: seasonUnit(season),
    seasonIds: [season.id],
  }));
}

// One column per financial year, summing its reporting seasons. Seasons come oldest first,
// so the years do too.
function yearlyColumns(seasons: ResultSeason[]): ResultColumn[] {
  const years = new Map<number, ResultColumn>();
  for (const season of seasons) {
    const { id, name } = season.financialYear;
    const year = years.get(id);
    if (year) year.seasonIds.push(season.id);
    else
      years.set(id, {
        key: String(id),
        label: name ?? "",
        unit: seasonUnit(season),
        seasonIds: [season.id],
      });
  }
  return [...years.values()];
}

// Sum of the column's seasons that have a value, or null if none of them do.
function columnValue(
  values: ResultGroup["fields"][number]["values"],
  column: ResultColumn,
): bigint | null {
  const present = column.seasonIds
    .map((id) => values[id])
    .filter((value): value is bigint => value != null);
  return present.length === 0 ? null : present.reduce((sum, value) => sum + value, BigInt(0));
}

// Result field groups in quarterly and yearly tabs: one table per group, with result fields
// as rows and reporting seasons or financial years as columns.
export async function ResultTables({ results: { seasons, groups } }: { results: CompanyResults }) {
  const t = await getTranslations("Results");

  const tabs = [
    { value: "quarterly", columns: quarterlyColumns(seasons) },
    { value: "yearly", columns: yearlyColumns(seasons) },
  ] as const;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{t("title")}</h2>
      {groups.length === 0 || seasons.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <Tabs defaultValue="quarterly">
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {t(`tabs.${tab.value}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="flex flex-col gap-4">
              {groups.map((group) => (
                <ResultTable key={group.id} group={group} columns={tab.columns} />
              ))}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </section>
  );
}

// Each column is shown in its own financial year's unit.
async function ResultTable({ group, columns }: { group: ResultGroup; columns: ResultColumn[] }) {
  const [t, format] = await Promise.all([getTranslations("Results"), getFormatter()]);

  function formatValue(value: bigint | null, unit: Unit) {
    if (value == null) return "–";
    return format.number(Number(value) / UNIT_DIVISORS[unit], {
      maximumFractionDigits: unit === "million" ? 1 : 0,
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium">{group.name}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-background" />
            {columns.map((column) => (
              <TableHead key={column.key} className="text-right">
                <div>{column.label}</div>
                <div className="text-xs font-normal text-muted-foreground">
                  {t(`units.${column.unit}`)}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {group.fields.map((field) => (
            <TableRow key={field.id}>
              <TableCell className="sticky left-0 bg-background">{field.name}</TableCell>
              {columns.map((column) => (
                <TableCell key={column.key} className="text-right tabular-nums">
                  {formatValue(columnValue(field.values, column), column.unit)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
