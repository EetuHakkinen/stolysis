"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { DiscountVariable } from "@/app/generated/prisma/client";
import { SavedNumberInput } from "@/components/saved-number-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  costOfEquity,
  DISCOUNT_VARIABLES,
  isPercentVariable,
  roundDiscountValue,
  wacc,
  type DiscountValues,
} from "@/lib/discounting";

// A company's discount variables, each saved when its input loses focus, followed by the cost of
// equity and the WACC calculated from them.
export function DiscountVariablesTable({
  values,
  save,
}: {
  values: DiscountValues;
  save: (variable: DiscountVariable, value: number | null) => Promise<boolean>;
}) {
  const t = useTranslations("DiscountVariables");
  const format = useFormatter();

  const calculated = [
    { key: "cost_of_equity", value: costOfEquity(values) },
    { key: "wacc", value: wacc(values) },
  ] as const;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("variable")}</TableHead>
          <TableHead className="text-right">{t("value")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {DISCOUNT_VARIABLES.map((variable) => (
          <TableRow key={variable}>
            <TableCell>{t(`variables.${variable}`)}</TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                <SavedNumberInput
                  value={values[variable] ?? null}
                  toValue={roundDiscountValue}
                  save={(value) => save(variable, value)}
                />
                <span className="w-3 text-xs text-muted-foreground">
                  {isPercentVariable(variable) && "%"}
                </span>
              </div>
            </TableCell>
          </TableRow>
        ))}
        {calculated.map(({ key, value }) => (
          <TableRow key={key} className="font-medium">
            <TableCell>
              {t(`variables.${key}`)}
              <span className="ml-2 text-xs font-normal text-muted-foreground">{t("calculated")}</span>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <div className="flex items-center justify-end gap-1">
                {value == null ? "–" : format.number(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="w-3 text-xs font-normal text-muted-foreground">%</span>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
