"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { Unit, ValueFormat } from "@/app/generated/prisma/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UNIT_DIVISORS } from "@/lib/units";

export type PeriodTableColumn = { key: string; label: string; unit: Unit };

// One result field group as a table, with result fields as rows and periods as columns, each
// shown in its own financial year's unit. The columns scroll beside the sticky field names,
// starting from the first ones, or from the last ones with scrollFromEnd: a right-to-left
// container starts scrolled fully right without effects, also in tabs that are hidden on load.
export function PeriodTable<Field extends { id: number; name: string | null }, Column extends PeriodTableColumn>({
  name,
  fields,
  columns,
  scrollFromEnd = false,
  cell,
}: {
  name: string | null;
  fields: Field[];
  columns: Column[];
  scrollFromEnd?: boolean;
  cell: (field: Field, column: Column) => React.ReactNode;
}) {
  const t = useTranslations("Results");

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium">{name}</h3>
      <Table
        containerClassName={scrollFromEnd ? "[direction:rtl]" : undefined}
        className={scrollFromEnd ? "[direction:ltr]" : undefined}
      >
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 bg-background" />
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
          {fields.map((field) => (
            <TableRow key={field.id}>
              <TableCell className="sticky left-0 z-10 bg-background">{field.name}</TableCell>
              {columns.map((column) => (
                <TableCell key={column.key} className="text-right align-top tabular-nums">
                  {cell(field, column)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Value in whole euros shown in the given unit with one decimal, or a dash when missing. Percent
// values are shown as is, with a percent sign.
export function FormattedValue({
  value,
  unit,
  valueFormat = "money",
}: {
  value: number | null | undefined;
  unit: Unit;
  valueFormat?: ValueFormat;
}) {
  const format = useFormatter();
  if (value == null) return "–";
  const formatted = format.number(valueFormat === "percent" ? value : value / UNIT_DIVISORS[unit], {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return valueFormat === "percent" ? `${formatted} %` : formatted;
}
