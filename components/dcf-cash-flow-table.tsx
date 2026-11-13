"use client";

import { useTranslations } from "next-intl";
import { FormattedValue, PeriodTable, type PeriodTableColumn } from "@/components/period-table";
import type { DcfResult, DcfTerminal, DcfYear } from "@/lib/dcf";
import type { EstimateYear } from "@/lib/estimates";

type Row = {
  id: number;
  name: string;
  bold?: boolean;
  year: (year: DcfYear) => number | null;
  // Rows without a terminal value are empty in the terminal column.
  terminal?: (terminal: DcfTerminal, enterpriseValue: number | null) => number | null;
};

const ROWS = [
  { key: "ebit", year: (year: DcfYear) => year.ebit },
  { key: "depreciation", year: (year: DcfYear) => year.depreciation },
  { key: "taxesPaid", year: (year: DcfYear) => year.taxesPaid },
  { key: "workingCapitalChange", year: (year: DcfYear) => year.workingCapitalChange },
  { key: "operatingCashFlow", year: (year: DcfYear) => year.operatingCashFlow, bold: true },
  { key: "capitalExpenditure", year: (year: DcfYear) => year.capitalExpenditure },
  {
    key: "freeCashFlow",
    year: (year: DcfYear) => year.freeCashFlow,
    bold: true,
    terminal: (terminal: DcfTerminal) => terminal.freeCashFlow,
  },
  {
    key: "discountedFreeCashFlow",
    year: (year: DcfYear) => year.discountedFreeCashFlow,
    bold: true,
    terminal: (terminal: DcfTerminal) => terminal.discountedValue,
  },
  {
    key: "cumulativeDiscountedFreeCashFlow",
    year: (year: DcfYear) => year.cumulativeDiscountedFreeCashFlow,
    terminal: (_: DcfTerminal, enterpriseValue: number | null) => enterpriseValue,
  },
] as const;

const TERMINAL = "terminal";

// The DCF's cash flows with the parts of each year as rows and the years as columns, shown in each
// year's unit: the current financial year for reference, without discounted values, then the
// discounted years. The last column is the terminal value's: the grown free cash flow, the
// discounted terminal value and, as the cumulative value, the enterprise value.
export function DcfCashFlowTable({
  dcf,
  years,
  label,
}: {
  dcf: DcfResult;
  years: EstimateYear[];
  // The financial year's name as shown in the tables, e.g. with an e for estimates.
  label: (year: EstimateYear) => string;
}) {
  const t = useTranslations("Dcf");

  const yearsById = new Map(years.map((year) => [year.id, year]));
  const shown = dcf.currentYear ? [dcf.currentYear, ...dcf.years] : dcf.years;
  const dcfYears = new Map(shown.map((year) => [year.yearId, year]));
  const lastUnit = yearsById.get(shown.at(-1)?.yearId ?? -1)?.unit ?? "one";
  const columns: PeriodTableColumn[] = [
    ...shown.map((year) => {
      const financialYear = yearsById.get(year.yearId);
      return {
        key: String(year.yearId),
        label: financialYear ? label(financialYear) : "",
        unit: financialYear?.unit ?? "one",
      };
    }),
    { key: TERMINAL, label: t("terminal"), unit: lastUnit },
  ];
  const rows: Row[] = ROWS.map((row, index) => ({ ...row, id: index, name: t(`rows.${row.key}`) }));

  return (
    <PeriodTable
      name={t("cashFlowTitle")}
      fields={rows}
      columns={columns}
      rowClassName={(row) => (row.bold ? "font-semibold" : undefined)}
      cell={(row, column) => {
        const value =
          column.key === TERMINAL
            ? (row.terminal?.(dcf.terminal, dcf.enterpriseValue) ?? null)
            : row.year(dcfYears.get(Number(column.key))!);
        return column.key === TERMINAL && !row.terminal ? null : <FormattedValue value={value} unit={column.unit} />;
      }}
    />
  );
}
