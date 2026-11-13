"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { Unit } from "@/app/generated/prisma/client";
import { FormattedValue } from "@/components/period-table";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { DcfResult } from "@/lib/dcf";

// DCF value of a company and the bridge from it to the equity value per share, one row each.
// Values are shown in the current financial year's unit, the value per share in euros.
export function DcfTable({ dcf, unit }: { dcf: DcfResult; unit: Unit }) {
  const t = useTranslations("Dcf");
  const tResults = useTranslations("Results");
  const tValuation = useTranslations("Valuation");
  const format = useFormatter();

  const rows = [
    { key: "enterpriseValue", value: dcf.enterpriseValue },
    { key: "netDebt", value: dcf.netDebt },
    { key: "dividend", value: dcf.dividend },
    { key: "equityValue", value: dcf.equityValue },
  ] as const;

  return (
    <Table>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key} className={row.key === "equityValue" ? "font-medium" : undefined}>
            <TableCell>{t(row.key)}</TableCell>
            <TableCell className="text-right tabular-nums">
              <FormattedValue value={row.value} unit={unit} />
              <span className="ml-1 text-xs font-normal text-muted-foreground">{tResults(`units.${unit}`)}</span>
            </TableCell>
          </TableRow>
        ))}
        <TableRow className="font-medium">
          <TableCell>{t("valuePerShare")}</TableCell>
          <TableCell className="text-right tabular-nums">
            {dcf.valuePerShare == null
              ? "–"
              : format.number(dcf.valuePerShare, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="ml-1 text-xs font-normal text-muted-foreground">{tValuation("perShareUnit")}</span>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
