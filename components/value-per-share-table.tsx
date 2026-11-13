"use client";

import { useFormatter, useTranslations } from "next-intl";
import { SectionTitle } from "@/components/section-title";
import { SignedPercent } from "@/components/signed-percent";
import { Table, TableBody, TableCell, TableFooter, TableRow } from "@/components/ui/table";
import { averageValuePerShare, pricePotential } from "@/lib/valuation";

// The company's value per share today by DCF and by the valuation multiples, and their average
// highlighted in the footer. With a stock price, also the average's potential: how much the price
// would change to reach it.
export function ValuePerShareTable({
  dcf,
  multiples,
  price,
}: {
  dcf: number | null;
  multiples: number | null;
  price: number | null;
}) {
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
  const average = averageValuePerShare(dcf, multiples);
  const potential = pricePotential(average, price);

  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>{t("title")}</SectionTitle>
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
            <TableCell className="text-right tabular-nums">{perShare(average)}</TableCell>
          </TableRow>
          {price != null && (
            <TableRow className="font-semibold">
              <TableCell>{t("potential")}</TableCell>
              <TableCell className="text-right">
                <SignedPercent value={potential} />
              </TableCell>
            </TableRow>
          )}
        </TableFooter>
      </Table>
    </div>
  );
}
