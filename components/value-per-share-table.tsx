"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableFooter, TableRow } from "@/components/ui/table";
import { averageValuePerShare } from "@/lib/valuation";

// The company's value per share today by DCF and by the valuation multiples, and their average
// highlighted in the footer.
export function ValuePerShareTable({ dcf, multiples }: { dcf: number | null; multiples: number | null }) {
  const t = useTranslations("ValuePerShare");
  const tValuation = useTranslations("Valuation");
  const format = useFormatter();

  const perShare = (value: number | null) => (
    <>
      {value == null ? "–" : format.number(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      <span className="ml-1 text-xs font-normal text-muted-foreground">{tValuation("perShareUnit")}</span>
    </>
  );
  const rows = [
    { key: "dcf", value: dcf },
    { key: "multiples", value: multiples },
  ] as const;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium">{t("title")}</h3>
      <Table>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell>{t(row.key)}</TableCell>
              <TableCell className="text-right tabular-nums">{perShare(row.value)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="text-base font-semibold">
            <TableCell>{t("average")}</TableCell>
            <TableCell className="text-right tabular-nums">{perShare(averageValuePerShare(dcf, multiples))}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
