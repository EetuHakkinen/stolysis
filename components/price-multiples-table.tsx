"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ValuationMultipleSummary } from "@/actions/valuation";
import type { ResultColumn } from "@/components/result-table";
import { SectionTitle } from "@/components/section-title";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// The valuation multiples the current stock price gives, with the multiples as rows and the years
// as columns.
export function PriceMultiplesTable({
  multiples,
  columns,
  values,
}: {
  multiples: ValuationMultipleSummary[];
  // Financial year columns.
  columns: ResultColumn[];
  // Multiples by multiple id, then by year id.
  values: Record<number, Record<number, number | null>>;
}) {
  const t = useTranslations("PriceMultiples");
  const format = useFormatter();

  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>{t("title")}</SectionTitle>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead />
            {columns.map((column) => (
              <TableHead key={column.key} className="text-right">
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {multiples.map((multiple) => (
            <TableRow key={multiple.id}>
              <TableCell>{multiple.name}</TableCell>
              {columns.map((column) => {
                const value = values[multiple.id]?.[column.period.financialYearId!];
                return (
                  <TableCell key={column.key} className="text-right tabular-nums">
                    {value == null ? "–" : format.number(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
