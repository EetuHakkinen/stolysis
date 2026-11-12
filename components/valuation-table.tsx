"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { Unit } from "@/app/generated/prisma/client";
import type { ValuationMultipleSummary } from "@/actions/valuation";
import { FormattedValue } from "@/components/period-table";
import { SavedNumberInput } from "@/components/saved-number-input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { roundMultiple, type CompanyValuationResult } from "@/lib/valuation";

// A scenario's valuation in the target year, with the multiples as rows: the multiple's value,
// which saves when it loses focus, and the enterprise value and market value it gives. Followed
// by the average market value and the value per share in the target year, and both discounted to
// the present.
export function ValuationTable({
  multiples,
  values,
  valuation,
  present,
  unit,
  save,
}: {
  multiples: ValuationMultipleSummary[];
  // Multiple values by multiple id.
  values: Record<number, number | null | undefined>;
  valuation: CompanyValuationResult;
  // Average market value and value per share discounted to the present.
  present: { marketValue: number | null; valuePerShare: number | null };
  // Unit of the target year.
  unit: Unit;
  save: (multipleId: number, value: number | null) => Promise<boolean>;
}) {
  const t = useTranslations("Valuation");
  const tResults = useTranslations("Results");
  const format = useFormatter();
  const rows = new Map(valuation.rows.map((row) => [row.multipleId, row]));

  const unitLabel = <div className="text-xs font-normal text-muted-foreground">{tResults(`units.${unit}`)}</div>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("multiple")}</TableHead>
          <TableHead className="text-right">{t("value")}</TableHead>
          <TableHead className="text-right">
            <div>{t("enterpriseValue")}</div>
            {unitLabel}
          </TableHead>
          <TableHead className="text-right">
            <div>{t("marketValue")}</div>
            {unitLabel}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {multiples.map((multiple) => (
          <TableRow key={multiple.id}>
            <TableCell>{multiple.name}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end">
                <SavedNumberInput
                  value={values[multiple.id] ?? null}
                  toValue={roundMultiple}
                  save={(value) => save(multiple.id, value)}
                />
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <FormattedValue value={rows.get(multiple.id)?.enterpriseValue} unit={unit} />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <FormattedValue value={rows.get(multiple.id)?.marketValue} unit={unit} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        {[
          { label: t("averageMarketValue"), marketValue: valuation.averageMarketValue },
          { label: t("valuePerShare"), perShare: valuation.valuePerShare },
          { label: t("presentMarketValue"), marketValue: present.marketValue },
          { label: t("presentValuePerShare"), perShare: present.valuePerShare },
        ].map((row) => (
          <TableRow key={row.label}>
            <TableCell colSpan={3}>{row.label}</TableCell>
            <TableCell className="text-right tabular-nums">
              {"marketValue" in row ? (
                <>
                  <FormattedValue value={row.marketValue} unit={unit} />
                  <span className="ml-1 text-xs font-normal text-muted-foreground">{tResults(`units.${unit}`)}</span>
                </>
              ) : (
                <>
                  {row.perShare == null
                    ? "–"
                    : format.number(row.perShare, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">{t("perShareUnit")}</span>
                </>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableFooter>
    </Table>
  );
}
